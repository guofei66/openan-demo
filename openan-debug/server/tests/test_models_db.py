from sqlalchemy import select
from sqlalchemy.orm import Session

from openan_debug.auth import hash_password, verify_password
from openan_debug.config import Settings
from openan_debug.db import init_db, make_engine
from openan_debug.models import Agent, Base, User


def test_password_hash_roundtrip():
    stored = hash_password("s3cret")
    assert stored != "s3cret"
    assert stored.startswith("pbkdf2_sha256$")
    iterations = int(stored.split("$")[1])
    assert 1 <= iterations <= 10_000_000
    assert verify_password("s3cret", stored)
    assert not verify_password("wrong", stored)


def test_verify_password_rejects_invalid_stored():
    assert verify_password("x", "garbage") is False
    assert verify_password("x", "") is False
    assert verify_password("x", None) is False


def test_hash_password_salt_uniqueness():
    assert hash_password("x") != hash_password("x")


def test_user_created_at_roundtrip_is_tz_aware(tmp_path):
    engine = make_engine(Settings(db_path=tmp_path / "tz.db"))
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        session.add(User(username="tz-user", password_hash=hash_password("pw")))
        session.commit()
    with Session(engine) as session:
        user = session.scalar(select(User).where(User.username == "tz-user"))
        assert user.created_at.tzinfo is not None
        assert "+00:00" in user.created_at.isoformat()


def test_init_db_prints_auto_generated_password(tmp_path, capsys):
    settings = Settings(db_path=tmp_path / "rand.db", admin_password=None)
    engine = make_engine(settings)
    init_db(engine, settings)
    prefix = "[openan-debug] bootstrap admin user 'admin' password: "
    line = next(l for l in capsys.readouterr().err.splitlines() if l.startswith(prefix))
    parsed = line[len(prefix):]
    with Session(engine) as session:
        admin = session.scalar(select(User).where(User.username == "admin"))
        assert verify_password(parsed, admin.password_hash) is True


def test_init_db_bootstraps_admin_and_agent(tmp_path):
    settings = Settings(db_path=tmp_path / "t.db", admin_password="boot-123")
    engine = make_engine(settings)
    init_db(engine, settings)
    with Session(engine) as session:
        admin = session.scalar(select(User).where(User.username == "admin"))
        assert admin is not None and admin.role == "admin"
        assert verify_password("boot-123", admin.password_hash)
        agent = session.scalar(select(Agent))
        assert agent is not None
    init_db(engine, settings)
    with Session(engine) as session:
        assert len(session.scalars(select(User)).all()) == 1
        assert len(session.scalars(select(Agent)).all()) == 1
