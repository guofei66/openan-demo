import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import dotenv_values


@dataclass(slots=True)
class Settings:
    host: str = "127.0.0.1"
    port: int = 9000
    db_path: Path = Path("data/openan-debug.db")
    jwt_secret: str = "dev-secret-change-me"
    jwt_expire_minutes: int = 720
    admin_password: str | None = None
    public_agent_url: str = "http://127.0.0.1:9000/debug/a2a"
    agent_internal_url: str = "http://127.0.0.1:9000/debug/a2a/message:send"
    stub_fallback: bool = True
    dataset_search: bool = True
    language: str = "zh-CN"
    env_path: Path = Path(".env")


def load_settings(env_path: Path | None = None) -> Settings:
    env_path = env_path or Path(os.environ.get("OPENAN_DEBUG_ENV", ".env"))
    file_values = dotenv_values(env_path) if env_path.exists() else {}

    def resolve(key: str, default: str) -> str:
        return os.environ.get(key) or file_values.get(key) or default

    stub_raw = resolve("OPENAN_DEBUG_STUB_FALLBACK", "on")
    ds_raw = resolve("OPENAN_DEBUG_DATASET_SEARCH", "on")
    return Settings(
        host=resolve("OPENAN_DEBUG_HOST", "127.0.0.1"),
        port=int(resolve("OPENAN_DEBUG_PORT", "9000")),
        db_path=Path(resolve("OPENAN_DEBUG_DB_PATH", "data/openan-debug.db")),
        jwt_secret=resolve("OPENAN_DEBUG_JWT_SECRET", "dev-secret-change-me"),
        jwt_expire_minutes=int(resolve("OPENAN_DEBUG_JWT_EXPIRE_MINUTES", "720")),
        admin_password=resolve("OPENAN_DEBUG_ADMIN_PASSWORD", "") or None,
        public_agent_url=resolve("OPENAN_DEBUG_PUBLIC_URL", "http://127.0.0.1:9000/debug/a2a"),
        agent_internal_url=resolve(
            "OPENAN_DEBUG_AGENT_INTERNAL_URL", "http://127.0.0.1:9000/debug/a2a/message:send"
        ),
        stub_fallback=stub_raw.strip().lower() in {"", "on", "1", "true", "yes"},
        dataset_search=ds_raw.strip().lower() in {"", "on", "1", "true", "yes"},
        language=resolve("A2AT_LANGUAGE", "zh-CN"),
        env_path=env_path,
    )
