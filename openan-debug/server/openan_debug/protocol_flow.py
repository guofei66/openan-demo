import uuid
from dataclasses import dataclass, field

from a2a_t.core.errors.exceptions import (
    A2ATError,
    ContentValidationError,
    NegotiationParamExtractionError,
)
from a2a_t.core.metadata import (
    NegotiationContext,
    NegotiationPerformative,
)
from a2a_t.core.standard_templates import INFORMATION_NEGOTIATION_PROPOSE_URI
from a2a_t.negotiation.content.models import (
    InformationProposeContent,
    NegotiationItem,
    NegotiationProposeData,
)

from .stub_service import fill_placeholders

CONTEXT_PARAM_KEYS = ("id", "round", "maxRounds")
LLM_FALLBACK_CODES = ("llm.not_configured", "llm.invocation_failed", "llm.response_invalid")
LLM_FAILURE_MARKERS = (
    "invocation failed",
    "invocation_failed",
    "not configured",
    "not_configured",
    "returned invalid json",
    "returned empty content",
    "must return a json object",
    "response did not include",
)


def is_llm_failure(message: str) -> bool:
    lowered = message.lower()
    return any(marker in lowered for marker in LLM_FAILURE_MARKERS)


@dataclass(slots=True)
class FlowRequest:
    template_uri: str | None
    prompt_text: str
    negotiation_context: dict | None
    requested_extensions: set[str] = field(default_factory=set)


@dataclass(slots=True)
class FlowResult:
    state: str
    message_text: str
    reply_metadata: dict
    artifact_data: dict | None
    negotiated: bool
    fallback_used: bool = False
    artifact_text: str | None = None
    artifact_name: str | None = None


def family_prefix(template_uri: str | None) -> str | None:
    return template_uri.split("/", 1)[0] if template_uri else None


def detect_missing(params_data) -> list[str]:
    if not isinstance(params_data, dict):
        return []
    return [
        key
        for key, value in params_data.items()
        if key not in CONTEXT_PARAM_KEYS and (value is None or (isinstance(value, str) and not value.strip()))
    ]


def missing_items_from_errors(errors) -> list[str]:
    names = []
    for error in errors or []:
        slot_name = getattr(error, "slot_name", None)
        if isinstance(slot_name, str) and slot_name.strip() and slot_name not in names:
            names.append(slot_name)
    return names


def carried_context_from_params(params_data) -> dict | None:
    if not isinstance(params_data, dict) or not {"id", "round"}.issubset(params_data):
        return None
    values = {key: params_data[key] for key in CONTEXT_PARAM_KEYS if key in params_data and params_data[key] is not None}
    return values or None


def _stub_result(template_uri: str, stub_fn, negotiated: bool, fallback: bool, params: dict | None = None) -> FlowResult:
    stub = stub_fn(template_uri)
    if stub is None:
        return FlowResult(
            state="FAILED",
            message_text=f"no enabled stub variant configured for template {template_uri}",
            reply_metadata={},
            artifact_data=None,
            negotiated=negotiated,
        )
    note = "stub data returned (LLM-less fallback mode)" if fallback else "stub data returned"
    filled = fill_placeholders(stub, params or {})
    # prompt 型变体（{"artifactPrompt": 文本, "artifactName": 名称}）：模拟真实响应形态
    # artifact.parts[0].text + artifact.metadata[扩展URI]=prompt，不带 templateUri（对齐 A2A-T Demo 实采报文）
    if isinstance(filled, dict) and isinstance(filled.get("artifactPrompt"), str):
        return FlowResult(
            state="COMPLETED",
            message_text=note,
            reply_metadata={},
            artifact_data=None,
            negotiated=negotiated,
            fallback_used=fallback,
            artifact_text=filled["artifactPrompt"],
            artifact_name=filled.get("artifactName") or None,
        )
    return FlowResult(
        state="COMPLETED",
        message_text=note,
        reply_metadata={},
        artifact_data=filled,
        negotiated=negotiated,
        fallback_used=fallback,
    )


def _validate(server, template_uri: str, prompt: str, schema):
    prefix = family_prefix(template_uri)
    if prefix == "Notification-T":
        return server.validate_notification_prompt_and_data_filling(prompt, schema, template_uri)
    if prefix == "Authorization-T":
        return server.validate_auth_prompt_and_data_filling(prompt, schema, template_uri)
    if prefix == "Negotiation-T":
        return server.validate_propose_prompt_and_data_filling(prompt, None, schema, template_uri)
    return server.validate_task_prompt_and_data_filling(prompt, schema, template_uri)


def _propose(server, missing: list[str], carried: dict | None) -> FlowResult:
    try:
        if carried:
            context = NegotiationContext(
                id=str(carried.get("id") or "").strip() or str(uuid.uuid4()),
                round=int(carried.get("round", 1)),
                max_rounds=int(carried.get("maxRounds", NegotiationContext.DEFAULT_MAX_ROUNDS)),
                performative=NegotiationPerformative.PROPOSE,
            ).next_round()
        else:
            context = NegotiationContext(
                id=str(uuid.uuid4()),
                round=1,
                max_rounds=NegotiationContext.DEFAULT_MAX_ROUNDS,
                performative=NegotiationPerformative.PROPOSE,
            )
    except (TypeError, ValueError) as error:
        return FlowResult(
            state="REJECTED",
            message_text=f"malformed negotiation context: {error}",
            reply_metadata={},
            artifact_data=None,
            negotiated=True,
        )
    if context.round > context.max_rounds:
        return FlowResult(
            state="FAILED",
            message_text=f"negotiation rounds exhausted (round {context.round}/{context.max_rounds})",
            reply_metadata={},
            artifact_data=None,
            negotiated=True,
        )
    items = [NegotiationItem(name=name, value=None) for name in missing]
    metadata_content = server.generate_negotiation_propose_prompt_from_data(
        NegotiationProposeData(context=context, content=InformationProposeContent(items=items, relationship=None)),
        INFORMATION_NEGOTIATION_PROPOSE_URI,
    )
    return FlowResult(
        state="INPUT_REQUIRED",
        message_text="missing required parameters, negotiation propose issued",
        reply_metadata=metadata_content.build_metadata_content(),
        artifact_data=None,
        negotiated=True,
    )


def run_flow(server, flow_env, request: FlowRequest, stub_fn, fallback_enabled: bool = True) -> FlowResult:
    template_uri = request.template_uri
    prompt_text = request.prompt_text
    if not template_uri or not prompt_text:
        return FlowResult(
            state="REJECTED",
            message_text="missing A2A-T metadata (templateUri or extension prompt text)",
            reply_metadata={},
            artifact_data=None,
            negotiated=False,
        )
    carried = request.negotiation_context
    if carried:
        performative = str(carried.get("performative", "")).upper()
        if performative in ("REJECT", "ABORT"):
            text = "client rejected the negotiation" if performative == "REJECT" else "client aborted the negotiation"
            return FlowResult(
                state="CANCELED", message_text=text, reply_metadata={}, artifact_data=None, negotiated=True
            )

    def _fallback() -> FlowResult | None:
        if fallback_enabled:
            return _stub_result(template_uri, stub_fn, negotiated=bool(carried), fallback=True)
        return None

    schema = flow_env.schema_for(template_uri)
    params = None
    missing: list[str] = []
    if schema is not None:
        try:
            compliance = server.check_task_prompt(processed_prompt_text=prompt_text)
            failure = getattr(compliance, "failure", None)
            if not compliance.success:
                code = str(getattr(failure, "code", "")) if failure is not None else "unknown"
                message = str(getattr(failure, "message", "")) if failure is not None else ""
                if code in LLM_FALLBACK_CODES or is_llm_failure(message):
                    fallback_result = _fallback()
                    if fallback_result is not None:
                        return fallback_result
                return FlowResult(
                    state="REJECTED",
                    message_text=f"prompt compliance failed: {code}: {message}",
                    reply_metadata={},
                    artifact_data=None,
                    negotiated=False,
                )
        except A2ATError as error:
            if error.code_str in LLM_FALLBACK_CODES or is_llm_failure(str(error)):
                fallback_result = _fallback()
                if fallback_result is not None:
                    return fallback_result
            return FlowResult(
                state="REJECTED",
                message_text=f"prompt check error: {error.code_str}: {error}",
                reply_metadata={},
                artifact_data=None,
                negotiated=False,
            )
        try:
            params = _validate(server, template_uri, prompt_text, schema)
            missing = detect_missing(getattr(params, "data", None))
        except (ContentValidationError, NegotiationParamExtractionError) as error:
            if error.code_str in LLM_FALLBACK_CODES or is_llm_failure(str(error)):
                fallback_result = _fallback()
                if fallback_result is not None:
                    return fallback_result
            slot_names = missing_items_from_errors(error.errors)
            if not slot_names:
                return FlowResult(
                    state="REJECTED",
                    message_text=f"validation failed: {error.code_str}: {error}",
                    reply_metadata={},
                    artifact_data=None,
                    negotiated=False,
                )
            missing = slot_names
        if missing:
            return _propose(
                server,
                missing,
                carried or carried_context_from_params(getattr(params, "data", None)) or getattr(params, "context", None),
            )

    if params is None:
        return _stub_result(template_uri, stub_fn, negotiated=bool(carried), fallback=True)
    if isinstance(params.data, list):
        params_map = {}
    else:
        params_map = {key: value for key, value in params.data.items() if key not in CONTEXT_PARAM_KEYS}
    return _stub_result(template_uri, stub_fn, negotiated=bool(carried), fallback=False, params=params_map)
