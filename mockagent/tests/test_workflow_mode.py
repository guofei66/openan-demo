# -*- coding: utf-8 -*-
"""工作流编排模式测试：内置工作流 / AgentCard 构建 / 事件摘要 / 控制点决策（async）。"""
import pytest

from mockagent_engine import agent_registry
from mockagent_engine import workflow_mode as wm

EXT_TASK_T = "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1"
EXT_NOTIFICATION_T = "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Notification-T/v1"

# 正式 PSOP（psop_live_event_assurance_en）的 9 个步骤
PSOP_STEP_NAMES = [f"step{i}" for i in range(1, 10)]


def test_load_builtin_formal_psop():
    wf = wm.load_builtin("psop_live_event_assurance_en")
    assert wf and wf["id"] == "psop_live_event_assurance_en"
    assert [s["name"] for s in wf["steps"]] == PSOP_STEP_NAMES
    # 三个自环步骤（Live Streaming Agent 本地执行）+ 六个远端派发步骤
    self_steps = [s["name"] for s in wf["steps"] if s.get("type") == "SelfLoop"]
    assert self_steps == ["step1", "step4", "step7"]


def test_load_builtin_unknown_returns_none():
    assert wm.load_builtin("no-such-workflow") is None


def test_list_builtin_contains_formal_psop():
    assert "psop_live_event_assurance_en" in [w["id"] for w in wm.list_builtin()]


def test_agent_cards_for_urls_and_schema():
    define = agent_registry.load_define()
    cards = wm.agent_cards_for(wm.load_builtin("psop_live_event_assurance_en"), define)
    by_name = {c["name"]: c for c in cards}
    assert by_name["Assurance Agent"]["supportedInterfaces"][0]["url"].endswith(":9102/")
    assert by_name["RAN Agent"]["supportedInterfaces"][0]["url"].endswith(":9115/")
    assert by_name["Live Streaming Agent"]["supportedInterfaces"][0]["url"].endswith(":9110/")
    for card in cards:
        assert card["capabilities"] == {"streaming": False}
        assert card["supportedInterfaces"][0]["protocolBinding"] == "HTTP+JSON"


def test_summarize_execution_success():
    events = [
        {"type": "step_start", "data": {"step": "step2"}},
        {"type": "agent_request", "data": {"agent": "Assurance Agent"}},
        {"type": "task_response", "data": {"step": "step2", "agent": "Assurance Agent",
                                            "status": "TASK_STATE_COMPLETED", "outputs": ["1. 保障策略生成：成功"]}},
        {"type": "step_complete", "data": {"step": "step2", "results": []}},
        {"type": "step_start", "data": {"step": "step9"}},
        {"type": "step_complete", "data": {"step": "step9", "results": []}},
        {"type": "complete", "data": {"step_outputs": {}}},
    ]
    summary = wm.summarize_execution({"events": events})
    assert summary["success"] is True
    assurance = next(s for s in summary["steps"] if s["step"] == "step2")
    assert assurance["status"] == "TASK_STATE_COMPLETED"
    assert assurance["agent"] == "Assurance Agent"
    assert assurance["outputPreview"].startswith("1. 保障策略生成")
    assert "保障策略生成" in summary["finalText"]


def test_summarize_execution_error_event():
    summary = wm.summarize_execution({"events": [{"type": "error", "data": {"error": "boom"}}]})
    assert summary["success"] is False
    assert any(s["step"] == "(error)" and s["status"] == "failed" for s in summary["steps"])


class _FakeReq:
    """TaskRequest 最小桩：只提供 on_task 读取的字段。"""

    def __init__(self, agent_name, skill="Network Policy Execution", step_name="step3"):
        self.agent_name = agent_name
        self.skill = skill
        self.instruction = "执行功率提升与覆盖增强任务"
        self.step_name = step_name
        self.workflow_input = None

        class _Input:
            text = "执行功率提升与覆盖增强任务"

        self.input = _Input


class _FakeSelf:
    def __init__(self, step_name, skill="", instruction=""):
        self.step_name = step_name
        self.skill = skill
        self.instruction = instruction
        self.workflow_input = None


async def test_on_task_builds_template_metadata():
    cp = wm.MockWorkflowControlPoint("执行赛事直播保障")
    mc = await cp.on_task(_FakeReq("RAN Agent"))
    md = dict(mc.metadata)
    assert md["templateUri"] == "Task-T/network-layer/ran-energy-saving/v1"
    assert EXT_TASK_T in mc.extensions
    assert len(md[EXT_TASK_T]) > 50, "extUri 应携带数据集样例请求全文"
    assert mc.parts[0].text


async def test_on_task_skill_override_picks_recovery_template():
    """同一 Agent 的不同技能可映射到不同模板：(Assurance Agent, Recovery Policy Dispatch)。"""
    cp = wm.MockWorkflowControlPoint("恢复初始配置")
    mc = await cp.on_task(_FakeReq("Assurance Agent", skill="Recovery Policy Dispatch", step_name="step8"))
    assert dict(mc.metadata)["templateUri"] == "Notification-T/network-layer/service-recovery/v1"
    assert EXT_NOTIFICATION_T in mc.extensions


async def test_on_task_without_template_keeps_plain_text():
    cp = wm.MockWorkflowControlPoint("任意意图")
    mc = await cp.on_task(_FakeReq("未登记的 Agent"))
    assert dict(mc.metadata).get("templateUri") is None
    assert mc.parts[0].text


async def test_on_self_task_event_info_parsing():
    cp = wm.MockWorkflowControlPoint("保障本月底城市马拉松赛事直播")
    result = await cp.on_self_task(_FakeSelf("step1", skill="Event Info Parsing"))
    assert result.success
    assert "赛事信息解析结果" in result.outputs[0]


async def test_on_self_task_kqi_degradation_and_recovery():
    cp = wm.MockWorkflowControlPoint("监控直播 KQI")
    degraded = await cp.on_self_task(
        _FakeSelf("step4", skill="KQI Monitoring",
                  instruction="display the live broadcast KQI ... discovers that KQI metrics decline")
    )
    assert degraded.success
    assert "发现劣化" in degraded.outputs[0]

    recovered = await cp.on_self_task(
        _FakeSelf("step7", skill="KQI Monitoring",
                  instruction="re-check the live broadcast KQI ... confirm that the degradation has been improved")
    )
    assert recovered.success
    assert "劣化已改善" in recovered.outputs[0]


async def test_on_self_task_aggregates_upstream():
    class _WI:
        class upstream_results:
            pass

    wi = _WI()
    wi.upstream_results = [
        type("U", (), {"step_name": "step2",
                        "task_results": [type("T", (), {"outputs": ["1. 保障策略生成：成功"]})()]})(),
    ]
    cp = wm.MockWorkflowControlPoint("任意意图")
    result = await cp.on_self_task(type("R", (), {"step_name": "聚合", "workflow_input": wi})())
    assert result.success
    assert "保障策略生成" in result.outputs[0]


async def test_on_route_allows():
    cp = wm.MockWorkflowControlPoint("任意意图")
    decision = await cp.on_route(_FakeReq("RAN Agent"))
    assert getattr(decision, "allowed", True)
