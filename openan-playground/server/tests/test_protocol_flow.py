import pytest
from a2a_t.core.errors.catalog import ErrorCatalog
from a2a_t.core.errors.exceptions import (
    A2ATError,
    ContentValidationError,
    NegotiationParamExtractionError,
)
from a2a_t.core.metadata import (
    NEGOTIATION_T_EXTENSION_URI,
    NegotiationContext,
    NegotiationPerformative,
)
from a2a_t.core.validation_pipeline import FilledParamData
from a2a_t.negotiation.content.enums import NegotiationConclusion
from a2a_t.negotiation.content.models import (
    InformationEndingContent,
    InformationProposeContent,
    NegotiationEndingData,
    NegotiationItem,
    NegotiationProposeData,
)
from a2a_t.server.a2at_server import A2ATServer
from a2a_t.server.prompt_compliance.models import PromptComplianceFailure, PromptComplianceResult

from openan_debug.protocol_flow import FlowRequest, run_flow

TASK_URI = "Task-T/network-layer/private-line-complaint/v1"
NOTIF_URI = "Notification-T/network-layer/subscribe-incident/v1"
PROPOSE_URI = "Negotiation-T/information-negotiation/propose/v1"
STUB = {"result": {"code": "{{slots.告警级别}}", "id": "R-1"}}


class FakeFlowEnv:
    language = "zh-CN"
    cursor = {}

    def schema_for(self, template_uri):
        return {"type": "object", "properties": {}}


class SchemalessFlowEnv:
    language = "zh-CN"
    cursor = {}

    def schema_for(self, template_uri):
        return None


class FakeServer:
    def __init__(self, *, compliance=None, params=None, validation_error=None):
        self._compliance = compliance
        self._params = params
        self._validation_error = validation_error
        self.propose_calls = []

    def check_task_prompt(self, *, processed_prompt_text):
        if isinstance(self._compliance, Exception):
            raise self._compliance
        return self._compliance

    def _validate_result(self):
        if self._validation_error is not None:
            raise self._validation_error
        return self._params

    def validate_task_prompt_and_data_filling(self, prompt, schema, template_uri):
        return self._validate_result()

    def validate_notification_prompt_and_data_filling(self, prompt, schema, template_uri):
        return self._validate_result()

    def validate_auth_prompt_and_data_filling(self, prompt, schema, template_uri):
        return self._validate_result()

    def validate_propose_prompt_and_data_filling(self, prompt, negotiation_context, schema, template_uri):
        return self._validate_result()

    def generate_negotiation_propose_prompt_from_data(self, data, template_uri):
        self.propose_calls.append((data, template_uri))
        from a2a_t.core.metadata import MetadataContent

        return MetadataContent(
            template_uri=template_uri,
            prompt_text="propose-prompt",
            extension_uri=NEGOTIATION_T_EXTENSION_URI,
            negotiation_context=data.context,
        )


class StrictComplianceServer(FakeServer):
    def check_task_prompt(self, *, processed_prompt_text):
        raise AssertionError("compliance check must not run without a schema")


def _req(uri=TASK_URI, ctx=None):
    return FlowRequest(template_uri=uri, prompt_text="prompt", negotiation_context=ctx, requested_extensions=set())


def _ok_params(data=None):
    return FilledParamData(data=data if data is not None else {"告警级别": "critical", "round": 2, "id": "x", "maxRounds": 5}, context=None)


def _stub_fn(uri):
    return STUB


def test_missing_metadata_rejected():
    result = run_flow(FakeServer(compliance=PromptComplianceResult(success=True)), FakeFlowEnv(),
                      FlowRequest(template_uri=None, prompt_text="", negotiation_context=None, requested_extensions=set()),
                      _stub_fn)
    assert result.state == "REJECTED"


def test_compliance_failure_rejected():
    server = FakeServer(compliance=PromptComplianceResult(
        success=False,
        failure=PromptComplianceFailure(code="slot.not_provided", message="missing", stage="semantic_validation")))
    result = run_flow(server, FakeFlowEnv(), _req(uri=NOTIF_URI), _stub_fn)
    assert result.state == "REJECTED"
    assert "slot.not_provided" in result.message_text


def test_compliance_scenario_not_matched_with_llm_failure_message_falls_back_to_stub():
    server = FakeServer(compliance=PromptComplianceResult(
        success=False,
        failure=PromptComplianceFailure(
            code="scenario.not_matched", message="openai invocation failed: connection refused", stage="semantic_validation")))
    result = run_flow(server, FakeFlowEnv(), _req(uri=NOTIF_URI), _stub_fn, fallback_enabled=True)
    assert result.state == "COMPLETED"
    assert result.fallback_used is True
    assert result.artifact_data == {"result": {"code": "", "id": "R-1"}}


def test_compliance_scenario_not_matched_without_llm_markers_is_rejected():
    server = FakeServer(compliance=PromptComplianceResult(
        success=False,
        failure=PromptComplianceFailure(
            code="scenario.not_matched", message="输入内容无法匹配任何已知场景: no reason", stage="semantic_validation")))
    result = run_flow(server, FakeFlowEnv(), _req(uri=NOTIF_URI), _stub_fn, fallback_enabled=True)
    assert result.state == "REJECTED"


def test_llm_failure_falls_back_to_stub():
    server = FakeServer(compliance=A2ATError("llm down", code=ErrorCatalog.LLM_INVOCATION_FAILED))
    result = run_flow(server, FakeFlowEnv(), _req(uri=NOTIF_URI), _stub_fn, fallback_enabled=True)
    assert result.state == "COMPLETED"
    assert result.fallback_used is True
    assert result.artifact_data == {"result": {"code": "", "id": "R-1"}}


def test_llm_failure_without_fallback_rejected():
    server = FakeServer(compliance=A2ATError("llm down", code=ErrorCatalog.LLM_INVOCATION_FAILED))
    result = run_flow(server, FakeFlowEnv(), _req(uri=NOTIF_URI), _stub_fn, fallback_enabled=False)
    assert result.state == "REJECTED"


def test_params_complete_returns_artifact_with_placeholders():
    server = FakeServer(compliance=PromptComplianceResult(success=True), params=_ok_params())
    result = run_flow(server, FakeFlowEnv(), _req(), _stub_fn)
    assert result.state == "COMPLETED"
    assert result.artifact_data["result"]["code"] == "critical"


def test_missing_params_triggers_propose_input_required():
    server = FakeServer(compliance=PromptComplianceResult(success=True),
                        params=FilledParamData(data={"告警级别": None, "round": 2, "id": "x", "maxRounds": 5}, context=None))
    result = run_flow(server, FakeFlowEnv(), _req(), _stub_fn)
    assert result.state == "INPUT_REQUIRED"
    assert result.negotiated is True
    metadata = result.reply_metadata
    assert metadata["templateUri"] == "Negotiation-T/information-negotiation/propose/v1"
    context = metadata["negotiationContext"]
    assert context["round"] == 3 and context["performative"] == "PROPOSE"
    data, template_uri = server.propose_calls[0]
    assert [item.name for item in data.content.items] == ["告警级别"]


def test_validation_slot_errors_trigger_propose():
    error = ContentValidationError(
        ErrorCatalog.SLOT_NOT_PROVIDED,
        errors=[type("S", (), {"slot_name": "订阅条件", "code": "slot.not_provided", "message": "m"})()],
    )
    server = FakeServer(compliance=PromptComplianceResult(success=True), validation_error=error)
    result = run_flow(server, FakeFlowEnv(), _req(uri=NOTIF_URI), _stub_fn)
    assert result.state == "INPUT_REQUIRED"
    assert result.reply_metadata["negotiationContext"]["round"] == 1


def test_negotiation_param_extraction_slot_errors_trigger_propose():
    error = NegotiationParamExtractionError(
        ErrorCatalog.SLOT_NOT_PROVIDED,
        errors=[type("S", (), {"slot_name": "订阅条件", "code": "slot.not_provided", "message": "m"})()],
    )
    server = FakeServer(compliance=PromptComplianceResult(success=True), validation_error=error)
    result = run_flow(server, FakeFlowEnv(), _req(uri=PROPOSE_URI), _stub_fn)
    assert result.state == "INPUT_REQUIRED"
    assert result.negotiated is True
    metadata = result.reply_metadata
    assert metadata["templateUri"] == PROPOSE_URI
    context = metadata["negotiationContext"]
    assert context["performative"] == "PROPOSE"
    data, template_uri = server.propose_calls[0]
    assert [item.name for item in data.content.items] == ["订阅条件"]


def test_negotiation_param_extraction_llm_error_falls_back_to_stub():
    error = NegotiationParamExtractionError(ErrorCatalog.LLM_INVOCATION_FAILED)
    server = FakeServer(compliance=PromptComplianceResult(success=True), validation_error=error)
    result = run_flow(server, FakeFlowEnv(), _req(uri=PROPOSE_URI), _stub_fn)
    assert result.state == "COMPLETED"
    assert result.fallback_used is True
    assert result.artifact_data == {"result": {"code": "", "id": "R-1"}}


def test_params_id_without_round_is_not_carried_context():
    server = FakeServer(compliance=PromptComplianceResult(success=True),
                        params=FilledParamData(data={"id": "INC-123", "告警级别": None}, context=None))
    result = run_flow(server, FakeFlowEnv(), _req(), _stub_fn)
    assert result.state == "INPUT_REQUIRED"
    context = result.reply_metadata["negotiationContext"]
    assert context["id"] != "INC-123"
    assert context["round"] == 1


def test_malformed_carried_context_rejected():
    server = FakeServer(compliance=PromptComplianceResult(success=True),
                        params=FilledParamData(data={"告警级别": None}, context=None))
    result = run_flow(server, FakeFlowEnv(),
                      _req(ctx={"round": "abc", "maxRounds": 5, "performative": "PROPOSE"}), _stub_fn)
    assert result.state == "REJECTED"
    assert "malformed negotiation context" in result.message_text


def test_blank_carried_context_id_gets_fresh_uuid():
    server = FakeServer(compliance=PromptComplianceResult(success=True),
                        params=FilledParamData(data={"告警级别": None}, context=None))
    result = run_flow(server, FakeFlowEnv(),
                      _req(ctx={"id": "", "round": 2, "maxRounds": 5, "performative": "PROPOSE"}), _stub_fn)
    assert result.state == "INPUT_REQUIRED"
    context = result.reply_metadata["negotiationContext"]
    assert context["id"]
    assert context["round"] == 3


def test_list_shaped_params_complete_stubs_with_empty_params():
    server = FakeServer(compliance=PromptComplianceResult(success=True),
                        params=FilledParamData(data=[{"a": 1}, {"a": 2}], context=None))
    result = run_flow(server, FakeFlowEnv(), _req(), _stub_fn)
    assert result.state == "COMPLETED"
    assert result.fallback_used is False
    assert result.message_text == "stub data returned"
    assert result.artifact_data == {"result": {"code": "", "id": "R-1"}}


def test_params_context_used_as_carried_context():
    server = FakeServer(compliance=PromptComplianceResult(success=True),
                        params=FilledParamData(data={"告警级别": None}, context={"id": "n9", "round": 2, "maxRounds": 5}))
    result = run_flow(server, FakeFlowEnv(), _req(), _stub_fn)
    assert result.state == "INPUT_REQUIRED"
    context = result.reply_metadata["negotiationContext"]
    assert context["id"] == "n9"
    assert context["round"] == 3


def test_schema_none_skips_compliance_and_stubs():
    result = run_flow(StrictComplianceServer(), SchemalessFlowEnv(), _req(), _stub_fn, fallback_enabled=False)
    assert result.state == "COMPLETED"
    assert result.fallback_used is True
    assert result.artifact_data == {"result": {"code": "", "id": "R-1"}}


def test_reject_and_abort_terminate():
    for performative, expected in (("REJECT", "CANCELED"), ("ABORT", "CANCELED")):
        ctx = {"id": "n1", "round": 1, "maxRounds": 5, "performative": performative}
        result = run_flow(FakeServer(compliance=PromptComplianceResult(success=True)), FakeFlowEnv(), _req(ctx=ctx), _stub_fn)
        assert result.state == expected
        assert result.negotiated is True


def test_rounds_exhausted_fails():
    ctx = {"id": "n1", "round": 5, "maxRounds": 5, "performative": "PROPOSE"}
    server = FakeServer(compliance=PromptComplianceResult(success=True),
                        params=FilledParamData(data={"告警级别": None}, context=None))
    result = run_flow(server, FakeFlowEnv(), _req(ctx=ctx), _stub_fn)
    assert result.state == "FAILED"


def test_no_variant_configured_fails():
    server = FakeServer(compliance=PromptComplianceResult(success=True), params=_ok_params({"告警级别": "low"}))
    result = run_flow(server, FakeFlowEnv(), _req(), lambda uri: None)
    assert result.state == "FAILED"
    assert "variant" in result.message_text


def test_real_server_propose_generation_smoke(settings):
    server = A2ATServer(env_path=settings.env_path)
    context = NegotiationContext(id="ctx-1", round=1, max_rounds=5, performative=NegotiationPerformative.PROPOSE)
    content = InformationEndingContent(conclusion=NegotiationConclusion.ACCEPT, items=[NegotiationItem(name="告警级别", value="critical")])
    metadata = server.generate_negotiation_accept_prompt_from_data(
        NegotiationEndingData(context=context, content=content), "Negotiation-T/information-negotiation/accept-reject/v1"
    )
    built = metadata.build_metadata_content()
    assert built["templateUri"] == "Negotiation-T/information-negotiation/accept-reject/v1"
    propose_metadata = server.generate_negotiation_propose_prompt_from_data(
        NegotiationProposeData(
            context=NegotiationContext(id="ctx-2", round=1, max_rounds=5, performative=NegotiationPerformative.PROPOSE),
            content=InformationProposeContent(items=[NegotiationItem(name="告警级别", value=None)], relationship=None),
        ),
        PROPOSE_URI,
    )
    propose_built = propose_metadata.build_metadata_content()
    assert propose_built["templateUri"] == PROPOSE_URI
    assert propose_built["negotiationContext"]["round"] == 1
