import asyncio
import threading
import time
import uuid

import httpx
import pytest
import uvicorn
from a2a.client.client import ClientConfig, ClientCallContext
from a2a.client.client_factory import ClientFactory
from a2a.types import AgentCard, SendMessageRequest
from a2a.utils.constants import TransportProtocol
from a2a_t.common.prompt_resources.resource_access import PackagedPromptResourceAccess
from a2a_t.core.metadata import NOTIFICATION_T_EXTENSION_URI, MetadataContent
from a2a_t.core.standard_templates import SUBSCRIBE_INCIDENT_URI
from google.protobuf.json_format import MessageToDict, ParseDict

from openan_debug.agent.agent_card import build_agent_card_payload
from tests.conftest import SUBSCRIBE_INCIDENT_URI as SEED_URI

PORT = 9911


def _start_server(app):
    config = uvicorn.Config(app, host="127.0.0.1", port=PORT, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(100):
        if server.started:
            break
        time.sleep(0.1)
    assert server.started, "uvicorn failed to start"
    return server


def _stop_server(server):
    server.should_exit = True
    time.sleep(0.5)


@pytest.fixture()
def live_client(app, seed_variant):
    server = _start_server(app)
    try:
        agent_card = ParseDict(
            build_agent_card_payload(f"http://127.0.0.1:{PORT}/debug/a2a"), AgentCard()
        )
        httpx_client = httpx.AsyncClient(
            base_url=f"http://127.0.0.1:{PORT}", timeout=60, trust_env=False
        )
        factory = ClientFactory(
            ClientConfig(
                httpx_client=httpx_client,
                supported_protocol_bindings=[TransportProtocol.HTTP_JSON],
                use_client_preference=True,
            )
        )
        a2a_client = factory.create(agent_card)
        yield a2a_client
    finally:
        _stop_server(server)


def _prompt_metadata() -> dict:
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


def test_e2e_stub_roundtrip(seed_variant, live_client):
    metadata = _prompt_metadata()
    request = ParseDict(
        {
            "message": {
                "messageId": str(uuid.uuid4()),
                "role": "ROLE_USER",
                "parts": [{"text": "subscribe incident"}],
                "metadata": metadata,
            }
        },
        SendMessageRequest(),
    )
    call_context = ClientCallContext.model_validate(
        {
            "service_parameters": {"A2A-Extensions": NOTIFICATION_T_EXTENSION_URI},
            "state": {},
            "timeout": None,
        }
    )

    async def _run():
        events = []
        try:
            async for stream_response in live_client.send_message(request, context=call_context):
                events.append(stream_response)
        finally:
            await live_client.close()
        return events

    events = asyncio.run(_run())
    assert events, "no events received"
    saw_artifact = False

    def _walk(value):
        nonlocal saw_artifact
        if isinstance(value, dict):
            if "faultManagement.Incident" in value:
                saw_artifact = True
            for child in value.values():
                _walk(child)
        elif isinstance(value, list):
            for child in value:
                _walk(child)
        else:
            if "faultManagement.Incident" in str(value):
                saw_artifact = True

    for event in events:
        for field_name in ("status_update", "message", "artifact_update", "task"):
            child = getattr(event, field_name, None)
            if child is not None and hasattr(child, "SerializeToString"):
                _walk(MessageToDict(child))
    assert saw_artifact, f"stub artifact missing in events: {[str(e)[:200] for e in events]}"
