# -*- coding: utf-8 -*-
"""工作流编排模式测试：内置工作流 / AgentCard 构建 / 事件摘要 / 控制点决策（async）。"""
import pytest

from mockagent_engine import agent_registry
from mockagent_engine import workflow_mode as wm

EXT_TASK_T = "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1"


def test_load_builtin_demo():
    wf = wm.load_builtin("live-assurance-demo")
    assert wf and wf["id"] == "live-assurance-demo"
    assert [s["name"] for s in wf["steps"]] == ["意图解析", "无线小区保障", "直播质量诊断", "结果聚合"]


def test_load_builtin_unknown_returns_none():
    assert wm.load_builtin("no-such-workflow") is None


def test_list_builtin_contains_demo():
    assert "live-assurance-demo" in [w["id"] for w in wm.list_builtin()]


def test_agent_cards_for_urls_and_schema():
    define = agent_registry.load_define()
    cards = wm.agent_cards_for(wm.load_builtin("live-assurance-demo"), define)
    by_name = {c["name"]: c for c in cards}
    assert by_name["无线域打桩 Agent"]["supportedInterfaces"][0]["url"].endswith(":9008/")
    assert by_name["直播打桩 Agent"]["supportedInterfaces"][0]["url"].endswith(":9009/")
    for card in cards:
        assert card["capabilities"] == {"streaming": False}
        assert card["supportedInterfaces"][0]["protocolBinding"] == "HTTP+JSON"


def test_summarize_execution_success():
    events = [
        {"type": "step_start", "data": {"step": "无线小区保障"}},
        {"type": "agent_request", "data": {"agent": "无线域打桩 Agent"}},
        {"type": "task_response", "data": {"step": "无线小区保障", "agent": "无线域打桩 Agent",
                                            "status": "TASK_STATE_COMPLETED", "outputs": ["1. 诊断结果：成功"]}},
        {"type": "step_complete", "data": {"step": "无线小区保障", "results": []}},
        {"type": "step_start", "data": {"step": "结果聚合"}},
        {"type": "step_complete", "data": {"step": "结果聚合", "results": []}},
        {"type": "complete", "data": {"step_outputs": {}}},
    ]
    summary = wm.summarize_execution({"events": events})
    assert summary["success"] is True
    wireless = next(s for s in summary["steps"] if s["step"] == "无线小区保障")
    assert wireless["status"] == "TASK_STATE_COMPLETED"
    assert wireless["agent"] == "无线域打桩 Agent"
    assert wireless["outputPreview"].startswith("1. 诊断结果")
    assert "诊断结果" in summary["finalText"]


def test_summarize_execution_error_event():
    summary = wm.summarize_execution({"events": [{"type": "error", "data": {"error": "boom"}}]})
    assert summary["success"] is False
    assert any(s["step"] == "(error)" and s["status"] == "failed" for s in summary["steps"])


class _FakeReq:
    """TaskRequest 最小桩：只提供 on_task 读取的字段。"""

    def __init__(self, agent_name, step_name="无线小区保障"):
        self.agent_name = agent_name
        self.skill = "stub-responder"
        self.instruction = "对保障区域内无线小区执行故障诊断"
        self.step_name = step_name
        self.workflow_input = None

        class _Input:
            text = "对保障区域内无线小区执行故障诊断"

        self.input = _Input


class _FakeSelf:
    def __init__(self, step_name):
        self.step_name = step_name
        self.workflow_input = None


async def test_on_task_builds_template_metadata():
    cp = wm.MockWorkflowControlPoint("端到端保障诊断")
    mc = await cp.on_task(_FakeReq("无线域打桩 Agent"))
    md = dict(mc.metadata)
    assert md["templateUri"] == "Task-T/network-layer/wireless-cell-diagnosis/v1"
    assert EXT_TASK_T in mc.extensions
    assert len(md[EXT_TASK_T]) > 50, "extUri 应携带数据集样例请求全文"
    assert mc.parts[0].text


async def test_on_task_without_template_keeps_plain_text():
    cp = wm.MockWorkflowControlPoint("任意意图")
    mc = await cp.on_task(_FakeReq("未登记的 Agent"))
    assert dict(mc.metadata).get("templateUri") is None
    assert mc.parts[0].text


async def test_on_self_task_intent_parses():
    cp = wm.MockWorkflowControlPoint("保障某赛事直播活动")
    result = await cp.on_self_task(_FakeSelf("意图解析"))
    assert result.success
    assert "意图解析结果" in result.outputs[0]


async def test_on_self_task_aggregates_upstream():
    class _WI:
        class upstream_results:
            pass

    wi = _WI()
    wi.upstream_results = [
        type("U", (), {"step_name": "无线小区保障",
                        "task_results": [type("T", (), {"outputs": ["1. 诊断结果：成功"]})()]})(),
    ]
    cp = wm.MockWorkflowControlPoint("任意意图")
    result = await cp.on_self_task(type("R", (), {"step_name": "结果聚合", "workflow_input": wi})())
    assert result.success
    assert "诊断结果" in result.outputs[0]


async def test_on_route_allows():
    cp = wm.MockWorkflowControlPoint("任意意图")
    decision = await cp.on_route(_FakeReq("无线域打桩 Agent"))
    assert getattr(decision, "allowed", True)
