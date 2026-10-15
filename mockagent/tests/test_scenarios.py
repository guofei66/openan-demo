# -*- coding: utf-8 -*-
"""场景目录测试：三类配置完整性 / 智能体引用校验 / 工作流两级查找 / 场景 API。"""
import json

import pytest

from mockagent_engine import agent_registry, scenario_registry, workflow_mode


def test_demo_scenario_has_all_three_configs():
    d = scenario_registry.resolve_scenario_dir("live-assurance-demo")
    assert (d / scenario_registry.SCENARIO_FILENAME).is_file()
    assert (d / scenario_registry.SCENARIO_WORKFLOW_FILENAME).is_file()
    assert (d / scenario_registry.SCENARIO_AGENTS_FILENAME).is_file()


def test_list_scenario_dirs():
    ids = {d.name for d in scenario_registry.list_scenario_dirs()}
    assert "live-assurance-demo" in ids


def test_resolve_scenario_dir_by_id_and_path():
    by_id = scenario_registry.resolve_scenario_dir("live-assurance-demo")
    by_path = scenario_registry.resolve_scenario_dir(str(by_id))
    assert by_path == by_id
    with pytest.raises(FileNotFoundError):
        scenario_registry.resolve_scenario_dir("no-such-scenario")


def test_storyline_structure():
    story = scenario_registry.load_storyline(scenario_registry.resolve_scenario_dir("live-assurance-demo"))
    assert story["id"] == "live-assurance-demo"
    assert story["name"] and story["nameEn"]
    line = story["storyline"]
    assert line["background"] and line["trigger"] and line["expectedOutcome"]
    phases = line["phases"]
    # 四个阶段与 PSOP 工作流步骤一一对应
    assert [p["stepRef"] for p in phases] == ["意图解析", "无线小区保障", "直播质量诊断", "结果聚合"]
    actor_ids = {a["agentId"] for a in line["actors"]}
    assert actor_ids == {"service-assurance-stub", "wireless-domain-stub", "livestream-stub"}


def test_scenario_agents_reference_existing_agents():
    cfg = scenario_registry.load_scenario_agents(scenario_registry.resolve_scenario_dir("live-assurance-demo"))
    ids = [a["id"] for a in cfg["agents"]]
    assert ids == ["service-assurance-stub", "wireless-domain-stub", "livestream-stub"]
    roles = {a["id"]: a["role"] for a in cfg["agents"]}
    assert roles["service-assurance-stub"] == "workflow-host"
    # 引用的 Agent 必须真实存在于 agents/（load_scenario_agents 已校验，此处复核）
    for agent_id in ids:
        agent_registry.resolve_agent_dir(agent_id)


def test_scenario_agents_unknown_id_raises(tmp_path):
    d = tmp_path / "bad-scenario"
    d.mkdir()
    (d / "agents.json").write_text(
        json.dumps({"scenarioId": "bad", "agents": [{"id": "ghost-agent"}]}, ensure_ascii=False),
        encoding="utf-8",
    )
    with pytest.raises(FileNotFoundError):
        scenario_registry.load_scenario_agents(d)


def test_scenario_agents_list_must_not_be_empty(tmp_path):
    d = tmp_path / "empty-agents"
    d.mkdir()
    (d / "agents.json").write_text(json.dumps({"agents": []}, ensure_ascii=False), encoding="utf-8")
    with pytest.raises(ValueError):
        scenario_registry.load_scenario_agents(d)


def test_scenario_workflow_via_builtin_lookup():
    """场景自带的 workflow.json 必须能被 workflowId 两级查找命中（工作流宿主链路不变）。"""
    wf = workflow_mode.load_builtin("live-assurance-demo")
    assert wf and wf["id"] == "live-assurance-demo"
    assert [s["name"] for s in wf["steps"]] == ["意图解析", "无线小区保障", "直播质量诊断", "结果聚合"]
    # 与场景目录里的文件是同一份（已从全局 workflows/ 迁入场景）
    in_scenario = scenario_registry.load_scenario_workflow(
        scenario_registry.resolve_scenario_dir("live-assurance-demo")
    )
    assert wf == in_scenario


def test_list_builtin_merges_scenario_workflows():
    entries = workflow_mode.list_builtin()
    demo = next(w for w in entries if w["id"] == "live-assurance-demo")
    assert demo.get("scenarioId") == "live-assurance-demo"


def test_load_scenario_missing_file_raises(tmp_path):
    d = tmp_path / "incomplete"
    d.mkdir()
    (d / "scenario.json").write_text("{}", encoding="utf-8")
    with pytest.raises(FileNotFoundError):
        scenario_registry.load_scenario(d)


def test_list_scenarios_summary():
    items = scenario_registry.list_scenarios()
    demo = next(s for s in items if s["id"] == "live-assurance-demo")
    assert demo["workflowId"] == "live-assurance-demo"
    assert demo["phaseCount"] == 4
    assert len(demo["agents"]) == 3


# ---- 场景 API ----

def test_scenarios_api_requires_auth(client):
    assert client.get("/api/v1/scenarios").status_code in (401, 403)


def test_scenarios_api_list(client, auth_headers):
    data = client.get("/api/v1/scenarios", headers=auth_headers).json()
    ids = [s["id"] for s in data["scenarios"]]
    assert "live-assurance-demo" in ids


def test_scenarios_api_detail(client, auth_headers):
    resp = client.get("/api/v1/scenarios/live-assurance-demo", headers=auth_headers)
    assert resp.status_code == 200
    detail = resp.json()
    assert detail["entry"]["workflowId"] == "live-assurance-demo"
    assert [p["stepRef"] for p in detail["storyline"]["phases"]] == [
        "意图解析", "无线小区保障", "直播质量诊断", "结果聚合"
    ]
    assert detail["workflow"]["id"] == "live-assurance-demo"
    by_id = {a["id"]: a for a in detail["agents"]}
    assert by_id["wireless-domain-stub"]["agent"]["endpoint"] == "http://127.0.0.1:9008"
    assert by_id["service-assurance-stub"]["role"] == "workflow-host"


def test_scenarios_api_404(client, auth_headers):
    assert client.get("/api/v1/scenarios/no-such", headers=auth_headers).status_code == 404
