import asyncio
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))

import httpx
from a2a.client.client import ClientConfig, ClientCallContext
from a2a.client.client_factory import ClientFactory
from a2a.types import AgentCard, SendMessageRequest
from a2a.utils.constants import TransportProtocol
from a2a_t.common.prompt_resources.resource_access import PackagedPromptResourceAccess
from a2a_t.core.metadata import NOTIFICATION_T_EXTENSION_URI, MetadataContent
from a2a_t.core.standard_templates import SUBSCRIBE_INCIDENT_URI
from google.protobuf.json_format import MessageToDict, ParseDict

BASE_URL = "http://47.236.98.226:9004/debug/a2a"
SERVER_DIR = Path(__file__).resolve().parent.parent / "server"


def build_metadata() -> dict:
    template_text = PackagedPromptResourceAccess().template_text(SUBSCRIBE_INCIDENT_URI, "zh-CN")
    for slot, value in {
        "通知主题": "Incident",
        "订阅条件": "故障优先级为：严重、高。故障名称为：光纤中断。",
        "上报通知数据格式": "通过DataPart上报Incident数据。",
    }.items():
        template_text = template_text.replace("{{" + slot + "}}", value)
    content = MetadataContent(
        template_uri=SUBSCRIBE_INCIDENT_URI, prompt_text=template_text, extension_uri=NOTIFICATION_T_EXTENSION_URI
    )
    return content.build_metadata_content()


async def main() -> int:
    saw_artifact = False

    def walk(value: object) -> None:
        nonlocal saw_artifact
        if isinstance(value, dict):
            if "faultManagement.Incident" in value:
                saw_artifact = True
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)
        elif "faultManagement.Incident" in str(value):
            saw_artifact = True

    async with httpx.AsyncClient(timeout=60, trust_env=False) as httpx_client:
        card_resp = await httpx_client.get(f"{BASE_URL}/.well-known/agent-card.json")
        card_resp.raise_for_status()
        agent_card = ParseDict(card_resp.json(), AgentCard())
        factory = ClientFactory(
            ClientConfig(
                httpx_client=httpx_client,
                supported_protocol_bindings=[TransportProtocol.HTTP_JSON],
                use_client_preference=True,
            )
        )
        client = factory.create(agent_card)
        request = ParseDict(
            {
                "message": {
                    "messageId": str(uuid.uuid4()),
                    "role": "ROLE_USER",
                    "parts": [{"text": "subscribe incident"}],
                    "metadata": build_metadata(),
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
        try:
            async for response in client.send_message(request, context=call_context):
                for field_name in ("status_update", "message", "artifact_update", "task"):
                    child = getattr(response, field_name, None)
                    if child is not None and hasattr(child, "SerializeToString"):
                        mapped = MessageToDict(child)
                        walk(mapped)
                        print(field_name, str(mapped)[:200])
        finally:
            await client.close()
    print("STUB ARTIFACT RECEIVED" if saw_artifact else "NO ARTIFACT")
    return 0 if saw_artifact else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
