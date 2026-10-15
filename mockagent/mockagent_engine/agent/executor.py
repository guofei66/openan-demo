import asyncio
import copy
import json
import logging
import time
import uuid

from google.protobuf.json_format import MessageToDict, ParseDict
from sqlalchemy.orm import Session

from a2a.server.agent_execution.agent_executor import AgentExecutor
from a2a.server.agent_execution.context import RequestContext
from a2a.server.events.event_queue import EventQueue
from a2a.types import Artifact, Task, TaskArtifactUpdateEvent, TaskStatus, TaskStatusUpdateEvent

from .. import dataset_retrieval, llm_client, workflow_mode
from ..models import Agent
from ..protocol_flow import FlowRequest, FlowResult, run_flow
from ..stub_service import pick_variant
from .base import StubAgentBase
from .flow_env import ext_uri_for

STATE_JSON = {
    "COMPLETED": "TASK_STATE_COMPLETED",
    "REJECTED": "TASK_STATE_REJECTED",
    "CANCELED": "TASK_STATE_CANCELED",
    "INPUT_REQUIRED": "TASK_STATE_INPUT_REQUIRED",
    "FAILED": "TASK_STATE_FAILED",
}

TERMINAL_STATES = ("TASK_STATE_COMPLETED", "TASK_STATE_FAILED", "TASK_STATE_CANCELED", "TASK_STATE_REJECTED")


def extract_request(context: RequestContext):
    exts = getattr(context, "requested_extensions", None)
    if not exts:
        call_context = getattr(context, "call_context", None)
        exts = getattr(call_context, "requested_extensions", None) if call_context is not None else None
    exts = set(exts or ())
    message = context.message
    if message is None or not message.metadata:
        return None, "", None, exts
    metadata = MessageToDict(message.metadata)
    template_uri = metadata.get("templateUri")
    ext_uri = ext_uri_for(template_uri)
    prompt_text = str(metadata.get(ext_uri, "")) if ext_uri else ""
    raw_context = metadata.get("negotiationContext")
    negotiation_context = raw_context if isinstance(raw_context, dict) else None
    return template_uri, prompt_text, negotiation_context, exts


def artifact_name(template_uri: str | None) -> str:
    if template_uri:
        segments = template_uri.rstrip("/").split("/")
        if len(segments) >= 2:
            return f"stub.{segments[-2]}"
    return "stub.result"


class MockAgentExecutor(AgentExecutor):
    def __init__(self, flow_env, runtime: dict, log_sink=None):
        self._flow_env = flow_env
        self._runtime = runtime
        self._log_sink = log_sink
        # Agent 子类实例（agents/<id>/agent.py 承载差异化能力）；缺省为基类（恒等钩子）
        self._agent = self._runtime.get("agent") or StubAgentBase()

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        return None

    def _llm_reply(self, template_uri, prompt_text, info: dict):
        """LLM 模式：模型按模板格式生成内容（参考编排中心 samples/agents）；失败返回 None 回落桩数据。"""
        cfg = self._runtime.get("llm_config")
        info["llm"] = {"mode": "llm" if cfg else "dataset", "used": False}
        if cfg is None or not template_uri or not prompt_text.strip():
            return None
        try:
            sample = dataset_retrieval.sample_response(template_uri)
            prompt = llm_client.build_simulator_prompt(
                self._agent_name(), template_uri, prompt_text, cfg.language, sample
            )
            text = llm_client.ask_llm(cfg, prompt)
        except Exception as error:
            logging.getLogger(__name__).warning("LLM generation failed, falling back to stub: %s", error)
            info["llm"]["error"] = str(error)[:300]
            return None
        info["llm"]["used"] = True
        info["llm"]["model"] = cfg.model
        segments = (template_uri or "").rstrip("/").split("/")
        artifact_name = f"llm.{segments[-2]}" if len(segments) >= 2 else "llm.result"
        return {"artifactPrompt": text, "artifactName": artifact_name}

    def _agent_name(self) -> str:
        engine = self._runtime.get("engine")
        agent_id = self._runtime.get("agent_id")
        if engine is not None and agent_id is not None:
            try:
                with Session(engine) as session:
                    agent = session.get(Agent, agent_id)
                if agent is not None:
                    return agent.name
            except Exception:
                logging.getLogger(__name__).exception("agent name lookup failed")
        return "MockAgent"

    def _workflow_reply(self, template_uri, prompt_text, info: dict):
        """工作流编排模式：实例配置 workflow.enabled 时作为宿主执行内置 PSOP；
        SELF_LOOP 本地生成，普通步骤经 workflow-engine-sdk 派发到其它打桩实例；
        失败返回 None 回落 LLM/数据集/变体池。"""
        cfg = self._runtime.get("workflow_config")
        info["workflow"] = {"mode": "workflow" if cfg else None, "used": False}
        if not cfg or not cfg.get("enabled"):
            return None
        workflow_id = cfg.get("workflowId") or "live-assurance-demo"
        workflow_dict = workflow_mode.load_builtin(workflow_id)
        agent_cards = self._runtime.get("workflow_cards") or []
        info["workflow"]["workflowId"] = workflow_id
        if not workflow_dict:
            info["workflow"]["error"] = f"workflow definition not found: {workflow_id}"
            return None
        if not agent_cards:
            info["workflow"]["error"] = "no agent cards resolved for workflow steps"
            return None
        intent = prompt_text.strip() or "执行工作流保障任务"
        try:
            outcome = workflow_mode.run_workflow_sync(workflow_dict, agent_cards, intent)
            summary = workflow_mode.summarize_execution(outcome)
        except Exception as error:
            logging.getLogger(__name__).warning("workflow execution failed: %s", error)
            info["workflow"]["error"] = str(error)[:300]
            return None
        info["workflow"].update({"used": True, **summary})
        if not summary.get("success"):
            info["workflow"]["error"] = "workflow finished without success"
            return None
        step_lines = []
        for s in summary.get("steps", []):
            step_lines.append(f"- {s.get('step')}：{s.get('status', '')}" + (f"（{s.get('agent', '')}）" if s.get("agent") else ""))
        artifact_text = (
            f"### 工作流执行结果（{workflow_id}）\n"
            + "\n".join(step_lines)
            + "\n\n" + (summary.get("finalText") or "")
        ).strip()
        return {"artifactPrompt": artifact_text, "artifactName": "workflow-execution-report"}

    def _select_stub(self, template_uri, prompt_text, info: dict):
        """桩数据选择优先级：Agent 差异化钩子 → 工作流编排模式 → LLM 生成模式 → 数据集匹配（标识回填）→ 变体池。"""
        template_uri, prompt_text = self._agent.transform_request(template_uri, prompt_text)
        workflow_result = self._workflow_reply(template_uri, prompt_text, info)
        if workflow_result is not None:
            return self._agent.transform_reply(template_uri, prompt_text, workflow_result) or workflow_result
        llm_result = self._llm_reply(template_uri, prompt_text, info)
        if llm_result is not None:
            return self._agent.transform_reply(template_uri, prompt_text, llm_result) or llm_result
        scope = self._runtime.get("dataset_templates")
        if template_uri and prompt_text and self._runtime["settings"].dataset_search:
            if scope is not None and template_uri not in scope:
                info["datasetMatch"] = {"skipped": "out-of-scope", "scopeTemplates": len(scope)}
            else:
                try:
                    match = dataset_retrieval.search(template_uri, prompt_text)
                except Exception:
                    logging.getLogger(__name__).exception("dataset retrieval failed")
                    match = None
                if match:
                    adapted = dataset_retrieval.adapt(match["responseText"], prompt_text)
                    info["datasetMatch"] = match["meta"]
                    reply = {"artifactPrompt": adapted, "artifactName": match["artifactName"]}
                    return self._agent.transform_reply(template_uri, prompt_text, reply) or reply
                info["datasetMatch"] = None
        else:
            info["datasetMatch"] = None
        engine = self._runtime.get("engine")
        if engine is None or template_uri is None:
            return None
        with Session(engine) as session:
            with self._flow_env.cursor_lock:
                variant = pick_variant(session, self._runtime["agent_id"], template_uri, self._flow_env.cursor)
            result = copy.deepcopy(variant.variant_json) if variant else None
            return self._agent.transform_reply(template_uri, prompt_text, result) or result

    def _agent_available(self) -> bool:
        engine = self._runtime.get("engine")
        agent_id = self._runtime.get("agent_id")
        if engine is None or agent_id is None:
            return False
        with Session(engine) as session:
            agent = session.get(Agent, agent_id)
        return agent is not None and agent.enabled

    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        started = time.monotonic()
        template_uri, prompt_text, negotiation_context, exts = extract_request(context)
        task_id = context.task_id or str(uuid.uuid4())
        context_id = context.context_id or str(uuid.uuid4())
        if self._agent_available():
            retrieval_info: dict = {}
            try:
                flow = await asyncio.to_thread(
                    run_flow,
                    self._flow_env.a2at,
                    self._flow_env,
                    FlowRequest(
                        template_uri=template_uri,
                        prompt_text=prompt_text,
                        negotiation_context=negotiation_context,
                        requested_extensions=exts,
                    ),
                    lambda tpl: self._select_stub(tpl, prompt_text, retrieval_info),
                    fallback_enabled=self._runtime["settings"].stub_fallback,
                )
            except Exception as error:
                flow = FlowResult(
                    state="FAILED",
                    message_text=f"internal error: {error}",
                    reply_metadata={},
                    artifact_data=None,
                    negotiated=False,
                )
        else:
            retrieval_info = {}
            flow = FlowResult(
                state="FAILED",
                message_text="mock agent disabled or missing",
                reply_metadata={},
                artifact_data=None,
                negotiated=False,
            )
        await self._enqueue(context, event_queue, task_id, context_id, flow, template_uri, retrieval_info.get("datasetMatch"))
        if self._log_sink is not None:
            entry = {
                "agent_id": self._runtime.get("agent_id"),
                "template_uri": template_uri,
                "direction": "inbound",
                "feature": "a2at",
                "request_body": {
                    "templateUri": template_uri,
                    "promptText": prompt_text,
                    "negotiationContext": negotiation_context,
                    "requestedExtensions": sorted(exts),
                },
                "response_body": {
                    "state": flow.state,
                    "message": flow.message_text,
                    "artifact": flow.artifact_data,
                    "artifactText": flow.artifact_text,
                    "replyMetadata": flow.reply_metadata,
                    "datasetMatch": retrieval_info.get("datasetMatch"),
                    "llm": retrieval_info.get("llm"),
                    "workflow": retrieval_info.get("workflow"),
                },
                "task_state": STATE_JSON.get(flow.state, "TASK_STATE_FAILED"),
                "negotiated": flow.negotiated,
                "latency_ms": int((time.monotonic() - started) * 1000),
            }
            try:
                await self._log_sink(entry)
            except Exception:
                logging.getLogger(__name__).exception("request log sink failed")
        state_json = STATE_JSON.get(flow.state, "TASK_STATE_FAILED")
        match_meta = retrieval_info.get("datasetMatch")
        trace_metadata = None
        if match_meta:
            try:
                trace_metadata = {"openan.datasetMatch": json.dumps(match_meta, ensure_ascii=False)}
            except (TypeError, ValueError):
                trace_metadata = None
        await self._update_status(context, event_queue, task_id, context_id, state_json, flow.message_text, flow.reply_metadata)
        if trace_metadata and state_json in TERMINAL_STATES:
            merged = dict(flow.reply_metadata or {})
            merged.update(trace_metadata)
            await self._update_status(context, event_queue, task_id, context_id, state_json, flow.message_text, merged)

    async def _enqueue(self, context, event_queue, task_id, context_id, flow: FlowResult, template_uri, match_meta=None):
        initial = ParseDict(
            {"id": task_id, "contextId": context_id, "status": {"state": "TASK_STATE_SUBMITTED"}}, Task()
        )
        await event_queue.enqueue_event(initial)
        if flow.state == "COMPLETED":
            await self._update_status(context, event_queue, task_id, context_id, "TASK_STATE_WORKING", "processing")
            match_metadata = {}
            if match_meta:
                try:
                    match_metadata = {"openan.datasetMatch": json.dumps(match_meta, ensure_ascii=False)}
                except (TypeError, ValueError):
                    match_metadata = {}
            if flow.artifact_text is not None:
                artifact_payload = {
                    "artifactId": str(uuid.uuid4()),
                    "name": flow.artifact_name or artifact_name(template_uri),
                    "parts": [{"text": flow.artifact_text}],
                }
                ext_uri = ext_uri_for(template_uri)
                if ext_uri:
                    artifact_payload["metadata"] = {ext_uri: flow.artifact_text}
                artifact_payload["metadata"].update(match_metadata)
                artifact = ParseDict(artifact_payload, Artifact(), ignore_unknown_fields=True)
            else:
                artifact = ParseDict(
                    {
                        "artifactId": str(uuid.uuid4()),
                        "name": artifact_name(template_uri),
                        "parts": [{"data": flow.artifact_data}],
                        "metadata": match_metadata,
                    },
                    Artifact(),
                    ignore_unknown_fields=True,
                )
            await event_queue.enqueue_event(
                TaskArtifactUpdateEvent(task_id=task_id, context_id=context_id, artifact=artifact, last_chunk=True)
            )
        elif flow.state == "INPUT_REQUIRED":
            await self._update_status(context, event_queue, task_id, context_id, "TASK_STATE_WORKING", "negotiating")

    async def _update_status(self, context, event_queue, task_id, context_id, state_json, text, metadata=None):
        status_payload = {
            "state": state_json,
            "message": {
                "contextId": context_id,
                "taskId": task_id,
                "role": "ROLE_AGENT",
                "parts": [{"text": text}],
            },
        }
        if metadata:
            status_payload["message"]["metadata"] = metadata
        if state_json in TERMINAL_STATES:
            status_payload["final"] = True
        status = ParseDict(status_payload, TaskStatus(), ignore_unknown_fields=True)
        current = Task()
        if context.current_task is not None:
            current.CopyFrom(context.current_task)
        current.id = task_id
        current.context_id = context_id
        current.status.CopyFrom(status)
        context.current_task = current
        await event_queue.enqueue_event(
            TaskStatusUpdateEvent(task_id=task_id, context_id=context_id, status=status)
        )
