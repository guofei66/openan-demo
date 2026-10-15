# -*- coding: utf-8 -*-
"""agents/ 目录注册表测试：目录扫描 / define 聚合 / Agent 定位。"""
import pytest

from mockagent_engine import agent_registry


def test_list_agent_dirs_returns_six():
    dirs = agent_registry.list_agent_dirs()
    assert len(dirs) == 6
    assert all((d / "agent.json").is_file() for d in dirs)


def test_load_define_shape():
    define = agent_registry.load_define()
    assert define["version"] == 1
    assert len(define["instances"]) == 6
    # 共享基线：调测台 12 模板变体池
    assert len(define["defaults"]["stubVariants"]) == 12


def test_every_agent_json_has_core_fields():
    for d in agent_registry.list_agent_dirs():
        agent = agent_registry.load_agent(d)
        assert agent["id"] == d.name, "agent.json 的 id 应与目录名一致"
        assert agent.get("name")
        assert isinstance(agent.get("port"), int) and 9000 < agent["port"] < 10000
        assert isinstance(agent.get("datasetTemplates"), list)
        assert agent.get("llm", {}).get("enabled") in (True, False)


def test_expected_agent_ids_present():
    ids = {a["id"] for a in agent_registry.load_define()["instances"]}
    assert {
        "fault-diagnosis-stub",
        "recovery-stub",
        "energy-saving-stub",
        "wireless-domain-stub",
        "livestream-stub",
        "service-assurance-stub",
    } == ids


def test_resolve_agent_dir_by_id():
    d = agent_registry.resolve_agent_dir("wireless-domain-stub")
    assert d.name == "wireless-domain-stub"


def test_resolve_agent_dir_by_path():
    d = agent_registry.resolve_agent_dir(str(agent_registry.agents_dir() / "livestream-stub"))
    assert d.name == "livestream-stub"


def test_resolve_agent_dir_missing_raises():
    with pytest.raises(FileNotFoundError):
        agent_registry.resolve_agent_dir("no-such-agent")


def test_load_defaults_llm_baseline():
    defaults = agent_registry.load_defaults()
    assert defaults["llm"]["apiKeyEnv"] == "MOCK_AGENT_LLM_API_KEY"
    assert defaults["llm"]["enabled"] is False
