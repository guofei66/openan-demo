import uuid

import pytest
from a2a_t.common.prompt_resources.resource_access import PackagedPromptResourceAccess
from a2a_t.core.metadata import NOTIFICATION_T_EXTENSION_URI, MetadataContent
from a2a_t.core.standard_templates import SUBSCRIBE_INCIDENT_URI
from sqlalchemy import select
from sqlalchemy.orm import Session

from openan_debug.models import RequestLog
from tests.conftest import auth_header


@pytest.fixture()
def prompt_metadata():
    template_text = PackagedPromptResourceAccess().template_text(SUBSCRIBE_INCIDENT_URI, "zh-CN")
    data = {
        "通知主题": "Incident",
        "订阅条件": "故障优先级为：严重、高。故障名称为：光纤中断。",
        "上报通知数据格式": "通过DataPart上报Incident数据。",
    }
    for slot, value in data.items():
        template_text = template_text.replace("{{" + slot + "}}", value)
    content = MetadataContent(
        template_uri=SUBSCRIBE_INCIDENT_URI, prompt_text=template_text, extension_uri=NOTIFICATION_T_EXTENSION_URI
    )
    return content.build_metadata_content()


def _send_body(metadata: dict) -> dict:
    return {
        "message": {
            "messageId": str(uuid.uuid4()),
            "role": "ROLE_USER",
            "parts": [{"text": "subscribe incident"}],
            "metadata": metadata,
        }
    }


def test_agent_card_endpoint(client):
    resp = client.get("/debug/a2a/.well-known/agent-card.json")
    assert resp.status_code == 200
    card = resp.json()
    assert card["name"] == "OpenAN Debug Mock Agent"
    bindings = card["supportedInterfaces"]
    assert bindings[0]["protocolBinding"] == "HTTP+JSON"
    extension_uris = [ext["uri"] for ext in card["capabilities"]["extensions"]]
    assert NOTIFICATION_T_EXTENSION_URI in extension_uris


def test_send_message_fallback_returns_stub_artifact(client, seed_variant, prompt_metadata):
    headers = {"A2A-Version": "1.0", "A2A-Extensions": NOTIFICATION_T_EXTENSION_URI}
    resp = client.post("/debug/a2a/message:send", json=_send_body(prompt_metadata), headers=headers)
    assert resp.status_code == 200, resp.text
    text = resp.text
    assert "COMPLETED" in text
    assert "faultManagement.Incident" in text
    assert "ETH-LOS" in text


def test_send_message_response_echoes_extensions(client, seed_variant, prompt_metadata):
    headers = {"A2A-Version": "1.0", "A2A-Extensions": NOTIFICATION_T_EXTENSION_URI}
    resp = client.post("/debug/a2a/message:send", json=_send_body(prompt_metadata), headers=headers)
    assert resp.status_code == 200
    assert resp.headers.get("a2a-extensions") == NOTIFICATION_T_EXTENSION_URI


def test_send_message_without_extensions_header_is_not_echoed(client, seed_variant, prompt_metadata):
    headers = {"A2A-Version": "1.0"}
    resp = client.post("/debug/a2a/message:send", json=_send_body(prompt_metadata), headers=headers)
    assert resp.status_code == 200
    assert "a2a-extensions" not in resp.headers


def test_send_message_without_variant_fails(client, prompt_metadata):
    headers = {"A2A-Version": "1.0", "A2A-Extensions": NOTIFICATION_T_EXTENSION_URI}
    resp = client.post("/debug/a2a/message:send", json=_send_body(prompt_metadata), headers=headers)
    assert resp.status_code == 200
    assert "FAILED" in resp.text or "variant" in resp.text


def test_send_message_logs_history(client, seed_variant, prompt_metadata):
    headers = {"A2A-Version": "1.0", "A2A-Extensions": NOTIFICATION_T_EXTENSION_URI}
    client.post("/debug/a2a/message:send", json=_send_body(prompt_metadata), headers=headers)
    with Session(client.app.state.engine) as session:
        logs = session.scalars(select(RequestLog).where(RequestLog.direction == "inbound")).all()
    assert len(logs) == 1
    log = logs[0]
    assert log.template_uri == SUBSCRIBE_INCIDENT_URI
    assert log.task_state == "TASK_STATE_COMPLETED"
    assert log.latency_ms is not None
    assert log.request_body["requestedExtensions"] == [NOTIFICATION_T_EXTENSION_URI]
