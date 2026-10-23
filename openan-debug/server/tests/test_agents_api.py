import uuid

import httpx
from a2a_t.core.metadata import NOTIFICATION_T_EXTENSION_URI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from openan_debug.config import Settings
from openan_debug.main import create_app
from openan_debug.models import RequestLog
from openan_debug.routers import console_router
from tests.conftest import TEST_ENV, SUBSCRIBE_INCIDENT_URI, auth_header


def _request_body():
    return {
        "message": {
            "messageId": str(uuid.uuid4()),
            "role": "ROLE_USER",
            "parts": [{"text": "subscribe incident"}],
            "metadata": {
                "templateUri": SUBSCRIBE_INCIDENT_URI,
                "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Notification-T/v1": "prompt",
            },
        }
    }


def _minimal_body():
    return {"message": {"messageId": str(uuid.uuid4()), "role": "ROLE_USER", "parts": [{"text": "ping"}]}}


def _install_mock_backend(monkeypatch, handler):
    real_client_factory = httpx.AsyncClient

    def fake_client_factory(**kwargs):
        return real_client_factory(transport=httpx.MockTransport(handler), timeout=kwargs.get("timeout"))

    monkeypatch.setattr(console_router.httpx, "AsyncClient", fake_client_factory)


def _create_user_token(client, admin_token, username="bob"):
    resp = client.post(
        "/api/v1/users", json={"username": username, "password": "password-123"}, headers=auth_header(admin_token)
    )
    assert resp.status_code == 201, resp.text
    resp = client.post("/api/v1/auth/login", json={"username": username, "password": "password-123"})
    assert resp.status_code == 200
    return resp.json()["token"]


def _create_agent(client, admin_token, name="Secondary Agent"):
    resp = client.post(
        "/api/v1/agents",
        json={"name": name, "organization": "OpenAN", "description": "second"},
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_agents_list_single_default(client, admin_token):
    resp = client.get("/api/v1/agents", headers=auth_header(admin_token))
    assert resp.status_code == 200
    agents = resp.json()
    assert len(agents) == 1
    assert agents[0]["isDefault"] is True
    assert agents[0]["enabled"] is True
    assert agents[0]["organization"] == "OpenAN"


def test_agents_create_and_list(client, admin_token):
    created = _create_agent(client, admin_token)
    assert created["isDefault"] is False
    assert created["enabled"] is True
    agents = client.get("/api/v1/agents", headers=auth_header(admin_token)).json()
    assert len(agents) == 2
    assert agents[0]["id"] < agents[1]["id"]
    assert agents[0]["isDefault"] is True
    assert agents[1]["isDefault"] is False
    assert agents[1]["id"] == created["id"]
    assert agents[1]["name"] == "Secondary Agent"


def test_agents_create_requires_admin(client, admin_token):
    user_token = _create_user_token(client, admin_token)
    resp = client.post("/api/v1/agents", json={"name": "Nope"}, headers=auth_header(user_token))
    assert resp.status_code == 403


def test_agents_get_unauthorized(client):
    assert client.get("/api/v1/agents").status_code == 401


def test_agents_create_rejects_blank_name(client, admin_token):
    resp = client.post("/api/v1/agents", json={"name": ""}, headers=auth_header(admin_token))
    assert resp.status_code == 422


def test_agents_patch_unknown_404(client, admin_token):
    resp = client.patch("/api/v1/agents/9999", json={"enabled": False}, headers=auth_header(admin_token))
    assert resp.status_code == 404


def test_agents_patch_disable_default_conflict(client, admin_token):
    agents = client.get("/api/v1/agents", headers=auth_header(admin_token)).json()
    resp = client.patch(f"/api/v1/agents/{agents[0]['id']}", json={"enabled": False}, headers=auth_header(admin_token))
    assert resp.status_code == 409


def test_agents_patch_disable_non_default(client, admin_token):
    created = _create_agent(client, admin_token)
    resp = client.patch(f"/api/v1/agents/{created['id']}", json={"enabled": False}, headers=auth_header(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["enabled"] is False
    agents = client.get("/api/v1/agents", headers=auth_header(admin_token)).json()
    assert agents[1]["enabled"] is False


def test_agents_patch_description(client, admin_token):
    created = _create_agent(client, admin_token)
    resp = client.patch(
        f"/api/v1/agents/{created['id']}", json={"description": "updated"}, headers=auth_header(admin_token)
    )
    assert resp.status_code == 200
    assert resp.json()["description"] == "updated"


def test_agents_delete_default_conflict(client, admin_token):
    agents = client.get("/api/v1/agents", headers=auth_header(admin_token)).json()
    resp = client.delete(f"/api/v1/agents/{agents[0]['id']}", headers=auth_header(admin_token))
    assert resp.status_code == 409


def test_agents_delete_non_default_soft(client, admin_token):
    created = _create_agent(client, admin_token)
    resp = client.delete(f"/api/v1/agents/{created['id']}", headers=auth_header(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["enabled"] is False
    agents = client.get("/api/v1/agents", headers=auth_header(admin_token)).json()
    assert len(agents) == 2
    target = next(agent for agent in agents if agent["id"] == created["id"])
    assert target["enabled"] is False


def test_agents_delete_idempotent_when_disabled(client, admin_token):
    created = _create_agent(client, admin_token)
    client.delete(f"/api/v1/agents/{created['id']}", headers=auth_header(admin_token))
    resp = client.delete(f"/api/v1/agents/{created['id']}", headers=auth_header(admin_token))
    assert resp.status_code == 200


def test_agents_create_network_without_domain_422(client, admin_token):
    resp = client.post(
        "/api/v1/agents",
        json={"name": "Net Agent", "layer": "network"},
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 422
    assert "网络层 Agent 必须选择所属子域" in resp.text


def test_agents_create_network_with_domain(client, admin_token):
    resp = client.post(
        "/api/v1/agents",
        json={"name": "Wireless Agent", "layer": "network", "networkDomain": "wireless"},
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 201, resp.text
    created = resp.json()
    assert created["layer"] == "network"
    assert created["networkDomain"] == "wireless"
    agents = client.get("/api/v1/agents", headers=auth_header(admin_token)).json()
    target = next(agent for agent in agents if agent["id"] == created["id"])
    assert target["layer"] == "network"
    assert target["networkDomain"] == "wireless"


def test_agents_create_service_with_domain_forces_null(client, admin_token):
    resp = client.post(
        "/api/v1/agents",
        json={"name": "Svc Agent", "layer": "service", "networkDomain": "optical"},
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 201, resp.text
    created = resp.json()
    assert created["layer"] == "service"
    assert created["networkDomain"] is None


def test_agents_create_rejects_invalid_layer_and_domain(client, admin_token):
    resp = client.post("/api/v1/agents", json={"name": "Bad", "layer": "core"}, headers=auth_header(admin_token))
    assert resp.status_code == 422
    resp = client.post(
        "/api/v1/agents", json={"name": "Bad", "layer": "network", "networkDomain": "grain"}, headers=auth_header(admin_token)
    )
    assert resp.status_code == 422


def test_agents_patch_layer_service_to_network_without_domain_422(client, admin_token):
    created = _create_agent(client, admin_token)
    resp = client.patch(
        f"/api/v1/agents/{created['id']}", json={"layer": "network"}, headers=auth_header(admin_token)
    )
    assert resp.status_code == 422
    assert "网络层 Agent 必须选择所属子域" in resp.text


def test_agents_patch_layer_to_network_with_domain(client, admin_token):
    created = _create_agent(client, admin_token)
    resp = client.patch(
        f"/api/v1/agents/{created['id']}",
        json={"layer": "network", "networkDomain": "cloudcore"},
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["layer"] == "network"
    assert resp.json()["networkDomain"] == "cloudcore"
    resp = client.patch(
        f"/api/v1/agents/{created['id']}", json={"layer": "service"}, headers=auth_header(admin_token)
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["layer"] == "service"
    assert resp.json()["networkDomain"] is None


def test_migration_adds_layer_columns(tmp_path):
    env_path = tmp_path / ".env"
    env_path.write_text(TEST_ENV, encoding="utf-8")
    settings = Settings(
        db_path=tmp_path / "migration.db",
        jwt_secret="test-secret",
        admin_password="admin-pass-01",
        language="zh-CN",
        env_path=env_path,
    )
    app = create_app(settings)
    with TestClient(app) as client:
        token = client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin-pass-01"}).json()[
            "token"
        ]
        agents = client.get("/api/v1/agents", headers=auth_header(token)).json()
        assert len(agents) == 1
        assert agents[0]["layer"] == "service"
        assert agents[0]["networkDomain"] is None
        from sqlalchemy import inspect

        inspector = inspect(client.app.state.engine)
        columns = {column["name"] for column in inspector.get_columns("agents")}
        assert "layer" in columns
        assert "network_domain" in columns


def test_mounted_agent_card(client, admin_token):
    created = _create_agent(client, admin_token, name="Custom Named Agent")
    resp = client.get(f"/debug/a2a/agent/{created['id']}/.well-known/agent-card.json")
    assert resp.status_code == 200, resp.text
    card = resp.json()
    assert card["name"] == "Custom Named Agent"
    assert card["description"] == "second"
    default_card = client.get("/debug/a2a/.well-known/agent-card.json").json()
    assert default_card["name"] == "OpenAN Debug Mock Agent"
    assert default_card["supportedInterfaces"][0]["url"] == client.app.state.settings.public_agent_url


def test_disabled_agent_direct_send_returns_failed(client, admin_token):
    created = _create_agent(client, admin_token)
    client.patch(f"/api/v1/agents/{created['id']}", json={"enabled": False}, headers=auth_header(admin_token))
    headers = {"A2A-Version": "1.0", "A2A-Extensions": NOTIFICATION_T_EXTENSION_URI}
    resp = client.post(f"/debug/a2a/agent/{created['id']}/message:send", json=_minimal_body(), headers=headers)
    assert resp.status_code == 200, resp.text
    assert "TASK_STATE_FAILED" in resp.text
    assert "mock agent disabled or missing" in resp.text


def test_console_send_unknown_agent_404(client, admin_token):
    resp = client.post(
        "/api/v1/console/send", json={"request": _request_body(), "agentId": 9999}, headers=auth_header(admin_token)
    )
    assert resp.status_code == 404


def test_console_send_disabled_agent_409(client, admin_token):
    created = _create_agent(client, admin_token)
    client.patch(f"/api/v1/agents/{created['id']}", json={"enabled": False}, headers=auth_header(admin_token))
    resp = client.post(
        "/api/v1/console/send",
        json={"request": _request_body(), "agentId": created["id"]},
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 409


def test_console_send_default_agent_url_and_log(client, admin_token, monkeypatch):
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        return httpx.Response(200, json={"task": {"status": {"state": "TASK_STATE_COMPLETED"}}})

    _install_mock_backend(monkeypatch, handler)
    agents = client.get("/api/v1/agents", headers=auth_header(admin_token)).json()
    default_id = agents[0]["id"]
    resp = client.post(
        "/api/v1/console/send",
        json={"request": _request_body(), "agentId": default_id},
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 200, resp.text
    assert captured["url"].endswith("/debug/a2a/message:send")
    with Session(client.app.state.engine) as session:
        log = session.scalar(select(RequestLog).where(RequestLog.direction == "console").order_by(RequestLog.id.desc()))
    assert log.agent_id == default_id


def test_console_send_created_agent_url_and_log(client, admin_token, monkeypatch):
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        return httpx.Response(200, json={"task": {"status": {"state": "TASK_STATE_COMPLETED"}}})

    _install_mock_backend(monkeypatch, handler)
    created = _create_agent(client, admin_token)
    resp = client.post(
        "/api/v1/console/send",
        json={"request": _request_body(), "agentId": created["id"]},
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 200, resp.text
    assert captured["url"].endswith(f"/debug/a2a/agent/{created['id']}/message:send")
    with Session(client.app.state.engine) as session:
        log = session.scalar(select(RequestLog).where(RequestLog.direction == "console").order_by(RequestLog.id.desc()))
    assert log.agent_id == created["id"]


def test_patch_enable_remounts_disabled_agent(tmp_path):
    env_path = tmp_path / ".env"
    env_path.write_text(TEST_ENV, encoding="utf-8")
    settings = Settings(
        db_path=tmp_path / "remount.db",
        jwt_secret="test-secret",
        admin_password="admin-pass-01",
        language="zh-CN",
        env_path=env_path,
    )
    app_one = create_app(settings)
    with TestClient(app_one) as client_one:
        token = client_one.post("/api/v1/auth/login", json={"username": "admin", "password": "admin-pass-01"}).json()[
            "token"
        ]
        headers = auth_header(token)
        created = client_one.post("/api/v1/agents", json={"name": "ReAgent"}, headers=headers).json()
        client_one.patch(f"/api/v1/agents/{created['id']}", json={"enabled": False}, headers=headers)
    app_two = create_app(settings)
    with TestClient(app_two) as client_two:
        token = client_two.post("/api/v1/auth/login", json={"username": "admin", "password": "admin-pass-01"}).json()[
            "token"
        ]
        headers = auth_header(token)
        resp = client_two.patch(f"/api/v1/agents/{created['id']}", json={"enabled": True}, headers=headers)
        assert resp.status_code == 200, resp.text
        card = client_two.get(f"/debug/a2a/agent/{created['id']}/.well-known/agent-card.json")
        assert card.status_code == 200, card.text
        assert card.json()["name"] == "ReAgent"
