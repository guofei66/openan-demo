import logging
import threading
from pathlib import Path

from a2a_t.common.prompt_resources.resource_access import PackagedPromptResourceAccess
from a2a_t.core.metadata import (
    AUTHORIZATION_T_EXTENSION_URI,
    NEGOTIATION_T_EXTENSION_URI,
    NOTIFICATION_T_EXTENSION_URI,
    TASK_T_EXTENSION_URI,
)
from a2a_t.server.a2at_server import A2ATServer

EXT_URI_BY_PREFIX = {
    "Task-T": TASK_T_EXTENSION_URI,
    "Notification-T": NOTIFICATION_T_EXTENSION_URI,
    "Authorization-T": AUTHORIZATION_T_EXTENSION_URI,
    "Negotiation-T": NEGOTIATION_T_EXTENSION_URI,
}

FALLBACK_ENV = """A2AT_LLM_PROVIDER=openai
A2AT_LLM_MODEL=dummy
A2AT_LLM_API_KEY=dummy
A2AT_LLM_BASE_URL=http://127.0.0.1:9
A2AT_LLM_MAX_ATTEMPTS=1
A2AT_LANGUAGE=zh-CN
"""


def ext_uri_for(template_uri: str | None) -> str | None:
    if not template_uri:
        return None
    return EXT_URI_BY_PREFIX.get(template_uri.split("/", 1)[0])


class FlowEnvironment:
    def __init__(self, settings):
        self.settings = settings
        self.language = settings.language
        self.cursor: dict = {}
        self.cursor_lock = threading.Lock()
        self.schema_access = PackagedPromptResourceAccess()
        self._schema_cache: dict = {}
        env_path = settings.env_path if settings.env_path.exists() else None
        try:
            self.a2at = A2ATServer(env_path=env_path)
        except Exception:
            logging.getLogger(__name__).exception("A2ATServer construction failed, falling back to built-in dummy LLM env")
            fallback = Path("data/a2at-fallback.env")
            fallback.parent.mkdir(parents=True, exist_ok=True)
            fallback.write_text(FALLBACK_ENV, encoding="utf-8")
            self.a2at = A2ATServer(env_path=fallback)

    def schema_for(self, template_uri: str):
        if template_uri in self._schema_cache:
            return self._schema_cache[template_uri]
        try:
            schema = self.schema_access.slot_schema(template_uri, self.language)
        except Exception:
            logging.getLogger(__name__).warning("slot schema lookup failed for %s", template_uri)
            return None
        self._schema_cache[template_uri] = schema
        return schema
