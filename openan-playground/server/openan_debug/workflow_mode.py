# -*- coding: utf-8 -*-
"""MockAgent 工作流编排模式（基于 workflow-engine-sdk / workflow-exec-engine）。

- 实例配置 `"workflow": {"enabled": true, "workflowId": "..."}` 后作为工作流宿主：
  收到请求（运行时意图）→ 按内置 PSOP 工作流执行；
- SELF_LOOP 步骤本地执行（意图解析 / 结果聚合）；
- 普通步骤经 SDK A2ATransport 派发为 A2A-T Task-T 请求到目标打桩实例
  （agent 名 → 实例端口 → 数据集样例请求作为模板 prompt），远端实例按数据集检索回包；
- 执行事件全程收集，回包 artifact 汇总各步骤输出；失败自动回落 LLM/数据集/变体池。
"""
from __future__ import annotations

import asyncio
import json
import logging
from importlib import resources as importlib_resources
from pathlib import Path

from a2a.types import Part
from workflow_engine import (
    ControlPoint,
    MessageContent,
    RouteDecision,
    TaskResult,
    execute_psop,
)

from . import dataset_retrieval

logger = logging.getLogger(__name__)

EXT_URIS = {
    "Task-T": "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1",
    "Notification-T": "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Notification-T/v1",
    "Authorization-T": "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Authorization-T/v1",
    "Negotiation-T": "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Negotiation-T/v1",
}

# 远端步骤目标 Agent → 该实例负责的 Task-T 模板（用于构造模板化 prompt，保证远端数据集检索命中）
AGENT_TEMPLATE_MAP = {
    "无线域打桩 Agent": "Task-T/network-layer/wireless-cell-diagnosis/v1",
    "直播打桩 Agent": "Task-T/network-layer/live-stream-quality/v1",
    "业务保障打桩 Agent": "Task-T/network-layer/private-line-complaint/v1",
    "故障诊断打桩 Agent": "Task-T/network-layer/private-line-complaint/v1",
    "业务抢通打桩 Agent": "Notification-T/network-layer/service-recovery/v1",
}

_WF_CACHE: dict[str, dict] = {}


def load_builtin(workflow_id: str) -> dict | None:
    """加载内置工作流定义（server/openan_debug/workflows/<id>.json）。"""
    if workflow_id in _WF_CACHE:
        return _WF_CACHE[workflow_id]
    filename = f"{workflow_id.replace('-', '_')}.json"
    try:
        raw = importlib_resources.files("openan_debug").joinpath("workflows").joinpath(filename).read_text(encoding="utf-8")
        data = json.loads(raw)
    except (OSError, ValueError):
        logger.warning("workflow definition not found: %s", filename)
        return None
    _WF_CACHE[workflow_id] = data
    return data


def list_builtin() -> list[dict]:
    """列出内置工作流（id/name/description）。"""
    result = []
    try:
        root = importlib_resources.files("openan_debug").joinpath("workflows")
        for item in sorted(Path(str(root)).glob("*.json")) if root.is_dir() else []:
            try:
                data = json.loads(item.read_text(encoding="utf-8"))
                result.append({"id": data.get("id") or item.stem, "name": data.get("name", ""), "description": data.get("description", "")})
            except ValueError:
                continue
    except (OSError, FileNotFoundError):
        pass
    return result


def agent_cards_for(workflow_dict: dict, define: dict) -> list[dict]:
    """工作流引用的 Agent 名 → 打桩实例 A2A 卡（a2a-sdk 1.1.2 AgentCard schema）。"""
    needed: set[str] = set()
    for step in workflow_dict.get("steps", []):
        for task in step.get("subtasks") or []:
            name = task.get("agent")
            if name:
                needed.add(name)
    cards = []
    for inst in define.get("instances", []):
        name = inst.get("agentName") or inst.get("name") or ""
        if name in needed:
            port = int(inst.get("port", 9300))
            cards.append({
                "name": name,
                "description": inst.get("description", ""),
                "version": "1.0.0",
                "capabilities": {"streaming": False},
                "supportedInterfaces": [{
                    "url": f"http://127.0.0.1:{port}/",
                    "protocolBinding": "HTTP+JSON",
                    "protocolVersion": "1.1",
                }],
            })
    missing = needed - {c["name"] for c in cards}
    if missing:
        logger.warning("workflow agents without instance cards: %s", sorted(missing))
    return cards


def _summarize_upstream(workflow_input) -> str:
    parts = []
    for upstream in getattr(workflow_input, "upstream_results", ()) or ():
        for tr in getattr(upstream, "task_results", ()) or ():
            outputs = [str(o) for o in (getattr(tr, "outputs", ()) or ())]
            if outputs:
                parts.append(f"[{upstream.step_name}] {outputs[0][:160]}")
    return "\n".join(parts)


class MockWorkflowControlPoint(ControlPoint):
    """工作流决策层：SELF_LOOP 本地生成；普通步骤构造 A2A-T Task-T 派发内容。"""

    def __init__(self, runtime_intent: str, language: str = "zh-CN"):
        self._intent = runtime_intent
        self._lang = language

    async def on_task(self, request) -> MessageContent:
        """远端步骤：按目标 Agent 的模板构造 A2A-T prompt（数据集样例请求保证远端命中）。"""
        template_uri = AGENT_TEMPLATE_MAP.get(request.agent_name)
        metadata: dict = {}
        extensions: set[str] = set()
        instruction = request.instruction or request.input.text or self._intent
        upstream = _summarize_upstream(request.workflow_input)
        if upstream:
            instruction = f"{instruction}\n\n上游步骤结果：\n{upstream}"
        if template_uri:
            prompt = dataset_retrieval.sample_request(template_uri) or instruction
            protocol = template_uri.split("/")[0]
            ext_uri = EXT_URIS.get(protocol)
            if ext_uri:
                metadata = {"templateUri": template_uri, ext_uri: prompt}
                extensions.add(ext_uri)
        return MessageContent(parts=(Part(text=instruction),), metadata=metadata, extensions=frozenset(extensions))

    async def on_self_task(self, request) -> TaskResult:
        """本地步骤：意图解析 / 结果聚合（确定性生成，无需模型）。"""
        name = request.step_name or ""
        upstream = _summarize_upstream(request.workflow_input)
        if "意图" in name:
            text = (
                f"1. 意图解析结果：成功\n"
                f"2. 运行时意图：{self._intent[:200]}\n"
                f"3. 保障计划：按工作流依次执行 无线小区保障 → 直播质量诊断 → 结果聚合\n"
                f"4. 上下文确认：任务输入合法，进入执行。"
            )
            return TaskResult.succeeded([text])
        outputs = getattr(request.workflow_input, "upstream_results", ()) or ()
        lines = []
        for u in outputs:
            lines.append(f"[{u.step_name}]")
            for tr in u.task_results:
                for o in tr.outputs:
                    lines.append(str(o))
        body = "\n".join(lines) if lines else "（无上游输出）"
        return TaskResult.succeeded([f"1. 聚合结果：成功\n2. 各步骤输出汇总：\n{body}"])

    async def on_route(self, request) -> RouteDecision:
        return RouteDecision.allow("demo workflow: unconditional edge")


async def _collect_events(workflow_dict: dict, agent_cards: list[dict], intent: str) -> dict:
    events = []
    async for event in execute_psop(
        psop=workflow_dict,
        agent_cards=agent_cards,
        control_point=MockWorkflowControlPoint(intent),
        runtime_intent=intent,
        ssl_verify=False,
        send_timeout_seconds=180,
    ):
        events.append(event)
        if event.get("type") in ("complete", "error"):
            break
    return {"events": events}


def run_workflow_sync(workflow_dict: dict, agent_cards: list[dict], intent: str) -> dict:
    """同步入口：在桩线程中执行工作流并收集事件（无活动事件循环，asyncio.run 安全）。"""
    return asyncio.run(_collect_events(workflow_dict, agent_cards, intent))


def summarize_execution(outcome: dict) -> dict:
    """把 execute_psop 事件流压缩为可读摘要（写入日志与响应）。"""
    events = outcome.get("events", [])
    steps: list[dict] = []
    by_name: dict[str, dict] = {}
    outputs_by_step: dict[str, list[str]] = {}
    current_step_name = ""
    final_text = ""
    success = False

    def _step(name: str) -> dict:
        entry = by_name.get(name)
        if entry is None:
            entry = {"step": name, "status": "running"}
            steps.append(entry)
            by_name[name] = entry
        return entry

    for ev in events:
        etype = ev.get("type")
        data = ev.get("data") or {}
        if etype == "step_start":
            current_step_name = data.get("step", "")
            _step(current_step_name)
        elif etype == "agent_request":
            step = by_name.get(current_step_name)
            if step is not None:
                step["agent"] = data.get("agent", "")
        elif etype == "task_response":
            step = _step(data.get("step", ""))
            step["agent"] = data.get("agent", step.get("agent", ""))
            step["status"] = str(data.get("status", "success"))
            outs = [str(o) for o in (data.get("outputs") or [])]
            if outs:
                step["outputPreview"] = outs[0][:200]
                outputs_by_step.setdefault(step["step"], []).extend(outs)
            if data.get("error"):
                step["status"] = "failed"
                step["error"] = str(data.get("error"))[:200]
        elif etype == "step_complete":
            step = _step(data.get("step", ""))
            if step.get("status") == "running":
                step["status"] = "success"
            results = data.get("results") or []
            outs: list[str] = []
            for r in results:
                if isinstance(r, dict):
                    outs.extend(str(o) for o in (r.get("outputs") or []))
            if outs:
                step["outputPreview"] = outs[0][:200]
                outputs_by_step.setdefault(step["step"], []).extend(outs)
        elif etype in ("complete", "workflow_complete"):
            success = True
        elif etype == "error":
            steps.append({"step": "(error)", "status": "failed", "error": str(data.get("error", ""))[:200]})

    # 最终文本：优先结果聚合步骤输出，否则最后有输出的步骤
    for preferred in ("结果聚合", "意图解析"):
        if outputs_by_step.get(preferred):
            final_text = "\n\n".join(outputs_by_step[preferred])
            break
    if not final_text:
        for name, outs in outputs_by_step.items():
            if outs:
                final_text = "\n\n".join(outs)
    return {
        "success": success,
        "steps": steps,
        "finalText": final_text[:4000],
    }
