from a2a.types import AgentCard
from google.protobuf.json_format import ParseDict

from a2a_t.core.metadata import (
    AUTHORIZATION_T_EXTENSION_URI,
    NEGOTIATION_T_EXTENSION_URI,
    NOTIFICATION_T_EXTENSION_URI,
    TASK_T_EXTENSION_URI,
)


def build_agent_card_payload(
    public_url: str, *, name: str | None = None, description: str | None = None
) -> dict:
    return {
        "name": name or "OpenAN Debug Mock Agent",
        "description": description
        or "OpenAN-Debug mock agent returning stub data for A2A-T integration testing",
        "version": "1.0.0",
        "defaultInputModes": ["application/json", "text/plain"],
        "defaultOutputModes": ["application/json", "text/plain"],
        "provider": {"organization": "OpenAN", "url": "https://github.com/project-openan"},
        "skills": [
            {
                "id": "stub-responder",
                "name": "Stub responder",
                "description": "Returns stubbed business data for configured A2A-T templates",
                "tags": ["stub", "mock", "debug"],
            }
        ],
        "capabilities": {
            "streaming": True,
            "pushNotifications": False,
            "extensions": [
                {"uri": TASK_T_EXTENSION_URI, "description": "Task-T structured prompt requests"},
                {"uri": NOTIFICATION_T_EXTENSION_URI, "description": "Notification-T structured prompt requests"},
                {"uri": AUTHORIZATION_T_EXTENSION_URI, "description": "Authorization-T structured prompt requests"},
                {"uri": NEGOTIATION_T_EXTENSION_URI, "description": "Negotiation-T structured prompt messages"},
            ],
        },
        "supportedInterfaces": [
            {"protocolBinding": "HTTP+JSON", "protocolVersion": "1.0.0", "url": public_url}
        ],
    }


def build_agent_card(
    public_url: str, *, name: str | None = None, description: str | None = None
) -> AgentCard:
    return ParseDict(build_agent_card_payload(public_url, name=name, description=description), AgentCard())
