from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from .config import Settings


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_agent_id(request: Request) -> int:
    agent_id = request.app.state.runtime["agent_id"]
    if agent_id is None:
        raise HTTPException(status_code=503, detail="Agent not initialized")
    return agent_id


def get_db(request: Request):
    engine = request.app.state.engine
    with Session(engine) as session:
        yield session
