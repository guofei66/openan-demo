from a2a_t.common.prompt_resources.resource_access import PackagedPromptResourceAccess
from a2a_t.core.standard_templates import (
    SERVICE_RECOVERY_URI,
    SUBSCRIBE_INCIDENT_URI,
)

from openan_debug.config import Settings, load_settings


def test_load_settings_reads_env_file(tmp_path):
    env = tmp_path / ".env"
    env.write_text("OPENAN_DEBUG_PORT=9100\nOPENAN_DEBUG_STUB_FALLBACK=off\n", encoding="utf-8")
    settings = load_settings(env)
    assert settings.port == 9100
    assert settings.stub_fallback is False


def test_settings_defaults():
    settings = Settings()
    assert settings.port == 9000
    assert settings.stub_fallback is True


def test_load_settings_does_not_pollute_os_environ(tmp_path):
    env = tmp_path / "leak.env"
    env.write_text("OPENAN_DEBUG_PORT=9200\n", encoding="utf-8")
    load_settings(env)
    fresh = load_settings(tmp_path / "missing.env")
    assert fresh.port == 9000


def test_stub_fallback_explicit_false(tmp_path):
    import os

    env = tmp_path / "fallback.env"
    env.write_text("OPENAN_DEBUG_STUB_FALLBACK=false\n", encoding="utf-8")
    assert load_settings(env).stub_fallback is False
    original = os.environ.get("OPENAN_DEBUG_STUB_FALLBACK")
    os.environ["OPENAN_DEBUG_STUB_FALLBACK"] = "0"
    try:
        assert load_settings(tmp_path / "missing2.env").stub_fallback is False
    finally:
        if original is None:
            os.environ.pop("OPENAN_DEBUG_STUB_FALLBACK", None)
        else:
            os.environ["OPENAN_DEBUG_STUB_FALLBACK"] = original


def test_packaged_slot_schema_resolves():
    schema = PackagedPromptResourceAccess().slot_schema(SUBSCRIBE_INCIDENT_URI, "zh-CN")
    assert schema["type"] == "object"
    assert "通知主题" in schema["properties"]
    schema2 = PackagedPromptResourceAccess().slot_schema(SERVICE_RECOVERY_URI, "zh-CN")
    assert isinstance(schema2, dict)
