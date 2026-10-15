# -*- coding: utf-8 -*-
"""Agent 子类机制测试：引擎基类 + agents/<id>/agent.py 差异化代码。"""
import shutil

import pytest

from mockagent_engine import agent_registry
from mockagent_engine.agent.base import StubAgentBase
from mockagent_engine.agent_registry import load_agent_class, load_agent_instance

EXPECTED_TYPES = {
    "fault-diagnosis-stub": "fault-diagnosis",
    "recovery-stub": "service-recovery",
    "energy-saving-stub": "energy-saving",
    "wireless-domain-stub": "wireless-domain",
    "livestream-stub": "live-stream",
    "service-assurance-stub": "workflow-host",
}


def test_every_agent_dir_has_own_subclass():
    for d in agent_registry.list_agent_dirs():
        cls = load_agent_class(d)
        assert issubclass(cls, StubAgentBase) and cls is not StubAgentBase, f"{d.name} 缺少 agent.py 子类"


def test_agent_types_per_domain():
    for d in agent_registry.list_agent_dirs():
        cls = load_agent_class(d)
        assert cls.agent_type == EXPECTED_TYPES[d.name], d.name


def test_missing_agent_py_falls_back_to_base(tmp_path):
    # 纯配置 Agent（只有 agent.json）仍可用：回落基类
    src = agent_registry.agents_dir() / "livestream-stub" / "agent.json"
    (tmp_path / "pure-config").mkdir()
    shutil.copy(src, tmp_path / "pure-config" / "agent.json")
    assert load_agent_class(tmp_path / "pure-config") is StubAgentBase


def test_agent_py_without_subclass_raises(tmp_path):
    (tmp_path / "broken").mkdir()
    (tmp_path / "broken" / "agent.json").write_text("{}", encoding="utf-8")
    (tmp_path / "broken" / "agent.py").write_text("class NotAnAgent:\n    pass\n", encoding="utf-8")
    with pytest.raises(TypeError):
        load_agent_class(tmp_path / "broken")


def test_load_agent_instance_injects_config():
    agents_dir = agent_registry.agents_dir()
    cls = load_agent_class(agents_dir / "wireless-domain-stub")
    obj = load_agent_instance(agents_dir / "wireless-domain-stub")
    assert isinstance(obj, cls)
    assert obj.id == "wireless-domain-stub"
    assert obj.display_name
    assert obj.dataset_templates is not None


def test_base_hooks_are_identity():
    base = StubAgentBase()
    assert base.transform_request("Task-T/x/v1", "文本") == ("Task-T/x/v1", "文本")
    assert base.transform_request(None, "文本") == (None, "文本")
    reply = {"artifactPrompt": "p", "artifactName": "n"}
    assert base.transform_reply(None, "文本", reply) is reply
    assert base.build_runtime({"a": 1}) == {"a": 1}
    assert base.capabilities() == ["dataset-matching", "variant-pool"]


def test_domain_inference_on_untyped_request():
    cases = {
        "wireless-domain-stub": ("小区切换失败导致掉线", "Task-T/network-layer/wireless-cell-diagnosis/v1"),
        "livestream-stub": ("直播间卡顿严重", "Task-T/network-layer/live-stream-quality/v1"),
        "recovery-stub": ("请尽快抢通中断专线", "Notification-T/network-layer/service-recovery/v1"),
        "energy-saving-stub": ("对闲时小区执行节能关断", "Task-T/network-layer/ran-energy-saving/v1"),
        "fault-diagnosis-stub": ("处理专线投诉工单", "Task-T/network-layer/private-line-complaint/v1"),
        "service-assurance-stub": ("端到端保障大型活动通信", "Task-T/network-layer/private-line-complaint/v1"),
    }
    for agent_id, (prompt, tpl) in cases.items():
        obj = load_agent_instance(agent_registry.agents_dir() / agent_id)
        inferred, text = obj.transform_request(None, prompt)
        assert inferred == tpl, agent_id
        assert text == prompt


def test_domain_inference_keeps_explicit_template():
    obj = load_agent_instance(agent_registry.agents_dir() / "livestream-stub")
    explicit = "Task-T/network-layer/wireless-cell-diagnosis/v1"
    assert obj.transform_request(explicit, "直播间卡顿") == (explicit, "直播间卡顿")
    # 无关文本不推断
    assert obj.transform_request(None, "你好") == (None, "你好")


def test_inference_reaches_dataset_matching():
    """差异化钩子的端到端价值：无类型意图 → 域内模板推断 → 数据集命中。"""
    from mockagent_engine import dataset_retrieval as dr

    obj = load_agent_instance(agent_registry.agents_dir() / "livestream-stub")
    tpl, prompt = obj.transform_request(None, dr.sample_request("Task-T/network-layer/live-stream-quality/v1"))
    assert tpl == "Task-T/network-layer/live-stream-quality/v1"
    hit = dr.search(tpl, prompt)
    assert hit and hit["meta"]["score"] >= 0.9


def test_workflow_host_capabilities():
    obj = load_agent_instance(agent_registry.agents_dir() / "service-assurance-stub")
    caps = obj.capabilities()
    assert "workflow-orchestration" in caps and "multi-agent-orchestration" in caps
