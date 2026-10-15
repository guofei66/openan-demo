# -*- coding: utf-8 -*-
"""调测台 API 层测试：健康检查 / 登录 / 实例列表 / 数据集分页（临时 DB，不落项目目录）。"""

import pytest


def test_health(client):
    assert client.get("/api/v1/health").status_code == 200


def test_login_wrong_password(client):
    resp = client.post("/api/v1/auth/login", json={"username": "admin", "password": "wrong"})
    assert resp.status_code == 401


def test_login_ok_returns_token(client, admin_password):
    resp = client.post("/api/v1/auth/login", json={"username": "admin", "password": admin_password})
    assert resp.status_code == 200
    body = resp.json()
    assert body["token"]
    assert body["role"] == "admin"


def test_mock_instances_requires_auth(client):
    assert client.get("/api/v1/mock-instances").status_code in (401, 403)


def test_mock_instances_list_from_agents_dir(client, auth_headers):
    data = client.get("/api/v1/mock-instances", headers=auth_headers).json()
    assert data["definePath"].endswith("agents")
    ids = {i["id"] for i in data["instances"]}
    assert len(ids) == 6
    assert {"fault-diagnosis-stub", "wireless-domain-stub", "service-assurance-stub"} <= ids
    for inst in data["instances"]:
        assert inst["endpoint"] == f"http://127.0.0.1:{inst['port']}"
        assert inst["workflow"]["enabled"] == (inst["id"] == "service-assurance-stub")


def test_agent_associations_returns_list(client, auth_headers):
    data = client.get("/api/v1/console/datasets/agent-associations", headers=auth_headers).json()
    assoc = data["associations"]
    assert isinstance(assoc, list)
    # 内嵌默认 Agent（未限定模板范围）+ 6 个打桩实例（各绑定 datasetTemplates）
    names = {a["name"] for a in assoc}
    assert "内嵌默认 Agent" in names and len(assoc) == 7
    scoped = {a["name"]: a["scoped"] for a in assoc}
    assert scoped["内嵌默认 Agent"] is False
    assert sum(1 for v in scoped.values() if v) == 6


def test_expanded_pairs_pagination(client, auth_headers):
    data = client.get(
        "/api/v1/console/datasets/expanded/pairs",
        params={"page": 1, "pageSize": 3},
        headers=auth_headers,
    ).json()
    assert len(data["items"]) == 3
    item = data["items"][0]
    assert item["pairId"] and item["templateUri"]
    assert "requestPromptPreview" in item


def test_expanded_pair_detail(client, auth_headers):
    listing = client.get(
        "/api/v1/console/datasets/expanded/pairs", params={"page": 1, "pageSize": 1}, headers=auth_headers
    ).json()
    pair_id = listing["items"][0]["pairId"]
    detail = client.get(f"/api/v1/console/datasets/expanded/pairs/{pair_id}", headers=auth_headers).json()
    assert detail["pairId"] == pair_id
    assert detail["requestPrompt"] and detail["responseText"]


def test_workflow_builtin_via_api_definition_not_exposed(client, auth_headers):
    """回归保护：实例视图必须暴露 workflow 开关（前端徽章依赖）。"""
    data = client.get("/api/v1/mock-instances", headers=auth_headers).json()
    assurance = next(i for i in data["instances"] if i["id"] == "service-assurance-stub")
    assert assurance["workflow"]["workflowId"] == "live-assurance-demo"
