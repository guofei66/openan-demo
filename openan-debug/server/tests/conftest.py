import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from openan_debug.config import Settings
from openan_debug.main import create_app
from openan_debug.models import Variant

TEST_ENV = """A2AT_LLM_PROVIDER=openai
A2AT_LLM_MODEL=dummy
A2AT_LLM_API_KEY=dummy
A2AT_LLM_BASE_URL=http://127.0.0.1:9
A2AT_LLM_MAX_ATTEMPTS=1
A2AT_LANGUAGE=zh-CN
"""

SUBSCRIBE_INCIDENT_URI = "Notification-T/network-layer/subscribe-incident/v1"

VARIANT_STUB = {
    "faultManagement.Incident": {
        "csn": "INC-{{timestamp}}",
        "name": "ETH-LOS",
        "priority": "critical",
        "status": "open",
        "topic": "{{slots.通知主题}}",
    }
}


@pytest.fixture()
def settings(tmp_path):
    env_path = tmp_path / ".env"
    env_path.write_text(TEST_ENV, encoding="utf-8")
    return Settings(
        db_path=tmp_path / "test.db",
        jwt_secret="test-secret",
        admin_password="admin-pass-01",
        language="zh-CN",
        env_path=env_path,
    )


@pytest.fixture()
def app(settings):
    return create_app(settings)


@pytest.fixture()
def client(app):
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def admin_token(client):
    resp = client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin-pass-01"})
    assert resp.status_code == 200
    return resp.json()["token"]


@pytest.fixture()
def engine(client):
    return client.app.state.engine


@pytest.fixture()
def seed_variant(client, admin_token):
    headers = auth_header(admin_token)
    resp = client.post(
        "/api/v1/seeds",
        json={
            "name": "订阅事件样本",
            "templateUri": SUBSCRIBE_INCIDENT_URI,
            "seedJson": {"faultManagement.Incident": {"csn": "INC-001", "priority": "critical"}},
            "description": "smoke",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    seed_id = resp.json()["id"]
    resp = client.post(
        "/api/v1/variants/import",
        json={"seedId": seed_id, "templateUri": SUBSCRIBE_INCIDENT_URI, "variants": [VARIANT_STUB]},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    with Session(client.app.state.engine) as session:
        agent_id = session.scalar(select(Variant.agent_id).limit(1))
    return {"seedId": seed_id, "agentId": agent_id, "templateUri": SUBSCRIBE_INCIDENT_URI}


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
