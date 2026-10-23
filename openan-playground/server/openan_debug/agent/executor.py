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
from .flow_env import ext_uri_for

STATE_JSON = {
    "COMPLETED": "TASK_STATE_COMPLETED",
    "REJECTED": "TASK_STATE_REJECTED",
    "CANCELED": "TASK_STATE_CANCELED",
    "INPUT_REQUIRED": "TASK_STATE_INPUT_REQUIRED",
    "FAILED": "TASK_STATE_FAILED",
}

TERMINAL_STATES = ("TASK_STATE_COMPLETED", "TASK_STATE_FAILED", "TASK_STATE_CANCELED", "TASK_STATE_REJECTED")

REPLY_MODES = ("auto", "variant", "workflow", "llm", "dataset")


def normalize_reply_mode(value) -> str:
    """归一化答复模式：auto（优先级链）/ variant（剧本回放·变体池固定文本）/ workflow / llm / dataset，其余按 auto。"""
    mode = str(value or "").strip().lower()
    return mode if mode in REPLY_MODES else "auto"


def extract_request(context: RequestContext):
    exts = getattr(context, "requested_extensions", None)
    if not exts:
        call_context = getattr(context, "call_context", None)
        exts = getattr(call_context, "requested_extensions", None) if call_context is not None else None
    exts = set(exts or ())
    message = context.message
    if message is None or not message.metadata:
        return None, "", None, exts, None
    metadata = MessageToDict(message.metadata)
    template_uri = metadata.get("templateUri")
    ext_uri = ext_uri_for(template_uri)
    prompt_text = str(metadata.get(ext_uri, "")) if ext_uri else ""
    raw_context = metadata.get("negotiationContext")
    negotiation_context = raw_context if isinstance(raw_context, dict) else None
    # 请求级答复模式（展厅卡片 / 调测台下拉随请求下发）：workflow|llm|dataset
    reply_mode = str(metadata.get("replyMode") or "").strip().lower() or None
    return template_uri, prompt_text, negotiation_context, exts, reply_mode


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

    def _agent_default_mode(self) -> str:
        """Agent 行级默认答复模式（调测台可改，存 agents.reply_mode）：
        请求未显式携带 replyMode 元数据时生效；实例进程与主服务共用 SQLite，
        改动即刻对运行中的实例生效。"""
        engine = self._runtime.get("engine")
        agent_id = self._runtime.get("agent_id")
        if engine is None or agent_id is None:
            return "auto"
        try:
            with Session(engine) as session:
                agent = session.get(Agent, agent_id)
            if agent is not None and getattr(agent, "reply_mode", None):
                return normalize_reply_mode(agent.reply_mode)
        except Exception:
            logging.getLogger(__name__).exception("agent reply_mode lookup failed")
        return "auto"

    def _pick_variant(self, template_uri):
        """变体池直取（固定文本；cursor 轮转由 flow_env 锁保护）。"""
        engine = self._runtime.get("engine")
        if engine is None or template_uri is None:
            return None
        with Session(engine) as session:
            with self._flow_env.cursor_lock:
                variant = pick_variant(session, self._runtime["agent_id"], template_uri, self._flow_env.cursor)
            return copy.deepcopy(variant.variant_json) if variant else None

    def _select_stub(self, template_uri, prompt_text, info: dict, reply_mode: str = "auto"):
        """桩数据选择优先级：工作流编排模式 → LLM 生成模式 → 数据集匹配（标识回填）→ 变体池。

        reply_mode 门控：'auto' 走完整优先级链；'variant'（剧本回放）直取变体池
        固定文本（不检索不生成）；'workflow'/'llm'/'dataset' 只走指定模式——指定
        模式不可用（实例未配置 / 执行失败）时降级数据集匹配，并在
        info["replyMode"] 标注 fallback 原因（对调用方可见、落 RequestLog）。"""
        mode = normalize_reply_mode(reply_mode)
        info["replyMode"] = {"mode": mode}
        if mode == "variant":
            picked = self._pick_variant(template_uri)
            if picked is not None:
                info["replyMode"]["used"] = "variant"
                return picked
            info["replyMode"]["used"] = "dataset"
            info["replyMode"]["fallback"] = "variant pool empty for template"
            # 降级：落入下方数据集匹配公共路径
        elif mode in ("auto", "workflow"):
            workflow_result = self._workflow_reply(template_uri, prompt_text, info)
            if workflow_result is not None:
                info["replyMode"]["used"] = "workflow"
                return workflow_result
            if mode == "workflow":
                info["replyMode"]["used"] = "dataset"
                info["replyMode"]["fallback"] = (
                    info.get("workflow", {}).get("error") or "workflow mode unavailable on this instance"
                )
        if mode in ("auto", "llm"):
            llm_result = self._llm_reply(template_uri, prompt_text, info)
            if llm_result is not None:
                info["replyMode"]["used"] = "llm"
                return llm_result
            if mode == "llm":
                info["replyMode"]["used"] = "dataset"
                info["replyMode"]["fallback"] = (
                    info.get("llm", {}).get("error") or "llm mode unavailable on this instance"
                )
        # 数据集匹配（标识回填）+ 变体池：auto 链尾 / 显式 dataset / 上方降级均落此处
        info["replyMode"].setdefault("used", "dataset")
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
                    return {"artifactPrompt": adapted, "artifactName": match["artifactName"]}
                info["datasetMatch"] = None
        else:
            info["datasetMatch"] = None
        return self._pick_variant(template_uri)

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
        template_uri, prompt_text, negotiation_context, exts, request_mode = extract_request(context)
        # 生效模式：请求级 replyMode 元数据 > Agent 行级默认（agents.reply_mode）> auto
        if request_mode:
            reply_mode = normalize_reply_mode(request_mode)
            reply_mode_source = "request"
        else:
            reply_mode = self._agent_default_mode()
            reply_mode_source = "agent"
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
                    lambda tpl: self._select_stub(tpl, prompt_text, retrieval_info, reply_mode),
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
        await self._enqueue(
            context,
            event_queue,
            task_id,
            context_id,
            flow,
            template_uri,
            retrieval_info.get("datasetMatch"),
            retrieval_info.get("replyMode"),
        )
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
                    "replyMode": reply_mode,
                    "replyModeSource": reply_mode_source,
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
                    "replyMode": retrieval_info.get("replyMode"),
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

    async def _enqueue(self, context, event_queue, task_id, context_id, flow: FlowResult, template_uri, match_meta=None, reply_mode_info=None):
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
            # 答复模式回执：请求/生效模式 + 实际使用模式 + 降级原因（演示端据此展示降级标记）
            if reply_mode_info:
                try:
                    match_metadata["openan.replyMode"] = json.dumps(reply_mode_info, ensure_ascii=False)
                except (TypeError, ValueError):
                    pass
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
