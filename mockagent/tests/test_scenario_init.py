# -*- coding: utf-8 -*-
"""场景初始化测试：PSOP 工作流写入 / 智能体拉起 / 状态 / 停止。

- 单测部分 mock 进程拉起（ensure_instance_running），聚焦工作流落位与汇总逻辑
- e2e 部分真实拉起 live-assurance-demo 的 3 个实例（宿主 9110 + 参与方 9102/9115），
  验证 init → status → 幂等 init → stop 全生命周期
"""
import json

import pytest

from mockagent_engine import scenario_registry, workflow_mode
from mockagent_engine.routers import scenarios_router


@pytest.fixture()
def fake_workflow_dir(tmp_path, monkeypatch):
    """工作流注册表指向临时目录（不污染项目根）。"""
    wf_dir = tmp_path / "workflows-registry"
    monkeypatch.setattr(workflow_mode, "workflows_dir", lambda: wf_dir)
    return wf_dir


def _fake_spawn_results(status="running"):
    def _ensure(instance, timeout=15.0):
        return {"id": instance["id"], "port": instance["port"], "status": status, "pid": 4321}

    return _ensure


def test_init_requires_auth(client):
    assert client.post("/api/v1/scenarios/live-assurance-demo/init").status_code in (401, 403)


def test_init_404_for_unknown_scenario(client, auth_headers):
    assert client.post("/api/v1/scenarios/no-such/init", headers=auth_headers).status_code == 404


def test_init_writes_psop_workflow_and_spawns(client, auth_headers, fake_workflow_dir, monkeypatch):
    monkeypatch.setattr(scenarios_router, "ensure_instance_running", _fake_spawn_results("running"))
    resp = client.post("/api/v1/scenarios/live-assurance-demo/init", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "ready"
    assert body["workflow"]["workflowId"] == "psop_live_event_assurance_en"
    # ① 全局注册表 + ② 宿主 workDir 副本，共两处落位
    assert len(body["workflow"]["written"]) == 2
    registry_file = fake_workflow_dir / "psop_live_event_assurance_en.json"
    assert registry_file.is_file()
    scenario_wf = scenario_registry.load_scenario_workflow(
        scenario_registry.resolve_scenario_dir("live-assurance-demo")
    )
    assert json.loads(registry_file.read_text(encoding="utf-8")) == scenario_wf
    # 三个智能体全部 running
    assert {a["id"] for a in body["agents"]} == {
        "an-l4-live-streaming-agent", "an-l4-assurance-agent", "an-l4-ran-agent"
    }
    assert all(a["status"] == "running" for a in body["agents"])


def test_init_partial_when_one_agent_fails(client, auth_headers, fake_workflow_dir, monkeypatch):
    def _ensure(instance, timeout=15.0):
        if instance["id"] == "an-l4-ran-agent":
            return {"id": instance["id"], "port": instance["port"], "status": "failed", "error": "boom"}
        return {"id": instance["id"], "port": instance["port"], "status": "running", "pid": 1}

    monkeypatch.setattr(scenarios_router, "ensure_instance_running", _ensure)
    body = client.post("/api/v1/scenarios/live-assurance-demo/init", headers=auth_headers).json()
    assert body["status"] == "partial"
    failed = next(a for a in body["agents"] if a["id"] == "an-l4-ran-agent")
    assert failed["status"] == "failed" and failed["error"] == "boom"


def test_init_clears_workflow_cache(client, auth_headers, fake_workflow_dir, monkeypatch):
    monkeypatch.setattr(scenarios_router, "ensure_instance_running", _fake_spawn_results())
    workflow_mode._WF_CACHE["psop_live_event_assurance_en"] = {"id": "stale"}
    client.post("/api/v1/scenarios/live-assurance-demo/init", headers=auth_headers)
    assert workflow_mode._WF_CACHE.get("psop_live_event_assurance_en") != {"id": "stale"}


def test_status_endpoint_reports_stopped_when_nothing_runs(client, auth_headers):
    body = client.get("/api/v1/scenarios/live-assurance-demo/status", headers=auth_headers).json()
    assert body["scenarioId"] == "live-assurance-demo"
    assert body["status"] in ("stopped", "partial")
    assert {a["id"] for a in body["agents"]} == {
        "an-l4-live-streaming-agent", "an-l4-assurance-agent", "an-l4-ran-agent"
    }


def test_stop_endpoint_is_idempotent(client, auth_headers, fake_workflow_dir):
    body = client.post("/api/v1/scenarios/live-assurance-demo/stop", headers=auth_headers).json()
    assert body["status"] == "stopped"
    assert all(a["status"] == "stopped" for a in body["agents"])


def test_scenario_init_lifecycle_end_to_end(client, auth_headers, fake_workflow_dir):
    """真实生命周期：init 拉起 3 个实例 → status ready → 幂等 init → stop 全停。"""
    resp = client.post("/api/v1/scenarios/live-assurance-demo/init", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "ready", body
    assert all(a["status"] == "running" for a in body["agents"])
    pids = {a["id"]: a["pid"] for a in body["agents"]}

    status = client.get("/api/v1/scenarios/live-assurance-demo/status", headers=auth_headers).json()
    assert status["status"] == "ready"
    assert all(a["status"] == "running" for a in status["agents"])

    again = client.post("/api/v1/scenarios/live-assurance-demo/init", headers=auth_headers).json()
    assert again["status"] == "ready"
    assert all(a["status"] == "already-running" for a in again["agents"])
    assert {a["id"]: a["pid"] for a in again["agents"]} == pids, "幂等 init 不应重复拉起进程"

    stopped = client.post("/api/v1/scenarios/live-assurance-demo/stop", headers=auth_headers).json()
    assert stopped["status"] == "stopped"
    after = client.get("/api/v1/scenarios/live-assurance-demo/status", headers=auth_headers).json()
    assert after["status"] == "stopped"
    assert all(a["status"] == "stopped" for a in after["agents"])
