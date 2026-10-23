import secrets
import sys

import sqlalchemy.exc
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from .auth import hash_password
from .config import Settings
from .models import Agent, Base, ServiceSettings, User

# 调试代理默认经 47.236.98.226:9004 的短前缀转发到阿里云上各服务（上游只监听 127.0.0.1，
# 由 nginx 9004 剥离前缀后转回本机端口）：
# /rc/  -> Registry Center(5000)     /oc/ -> Orchestration Center(5001)
# /a2a/ -> Mock Agent A2A(9100)      /ot/ -> Ontology(8787)
SERVICE_URL_DEFAULTS = {
    "registry_url": "http://47.236.98.226:9004/rc",
    "orchestration_url": "http://47.236.98.226:9004/oc",
    "execution_host_url": "http://47.236.98.226:9004/a2a",
    "ontology_url": "http://47.236.98.226:9004/ot",
}


def make_engine(settings: Settings):
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    return create_engine(
        f"sqlite:///{settings.db_path}", connect_args={"check_same_thread": False}
    )


def init_db(engine, settings: Settings) -> None:
    Base.metadata.create_all(engine)
    with engine.connect() as conn:
        for statement in (
            text("ALTER TABLE request_logs ADD COLUMN feature VARCHAR(16) DEFAULT 'a2at'"),
            text("ALTER TABLE agents ADD COLUMN layer VARCHAR(16) DEFAULT 'service'"),
            text("ALTER TABLE agents ADD COLUMN network_domain VARCHAR(16)"),
        ):
            try:
                conn.execute(statement)
                conn.commit()
            except Exception:
                pass
    with Session(engine) as session:
        session.execute(text("UPDATE request_logs SET feature='a2at' WHERE feature IS NULL"))
        session.commit()
        if session.scalar(select(User).limit(1)) is None:
            password = settings.admin_password or secrets.token_urlsafe(12)
            session.add(User(username="admin", password_hash=hash_password(password), role="admin"))
            try:
                session.commit()
            except sqlalchemy.exc.IntegrityError:
                session.rollback()
            if settings.admin_password is None:
                print(f"[openan-debug] bootstrap admin user 'admin' password: {password}", file=sys.stderr)
        if session.scalar(select(Agent).limit(1)) is None:
            session.add(Agent())
            try:
                session.commit()
            except sqlalchemy.exc.IntegrityError:
                session.rollback()
        for key, value in SERVICE_URL_DEFAULTS.items():
            if session.scalar(select(ServiceSettings).where(ServiceSettings.key == key)) is None:
                session.add(ServiceSettings(key=key, value=value))
        try:
            session.commit()
        except sqlalchemy.exc.IntegrityError:
            session.rollback()
