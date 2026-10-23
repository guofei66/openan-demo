from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_current_user, require_admin
from ..deps import get_db
from ..models import Agent
from ..schemas import AgentCreate, AgentPatch

router = APIRouter(prefix="/api/v1/agents", tags=["agents"])


def _agent_view(agent: Agent, default_agent_id: int | None) -> dict:
    return {
        "id": agent.id,
        "organization": agent.organization,
        "name": agent.name,
        "description": agent.description,
        "enabled": agent.enabled,
        "layer": agent.layer,
        "networkDomain": agent.network_domain,
        "isDefault": agent.id == default_agent_id,
    }


@router.get("")
def list_agents(request: Request, db: Session = Depends(get_db), _: dict = Depends(get_current_user)):
    agents = db.scalars(select(Agent).order_by(Agent.id)).all()
    default_agent_id = request.app.state.default_agent_id
    return [_agent_view(agent, default_agent_id) for agent in agents]


@router.post("", status_code=201)
def create_agent(
    body: AgentCreate, request: Request, db: Session = Depends(get_db), _: dict = Depends(require_admin)
):
    agent = Agent(
        organization=body.organization,
        name=body.name,
        description=body.description,
        enabled=True,
        layer=body.layer,
        network_domain=body.networkDomain,
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)
    from ..main import _mount_agent

    _mount_agent(request.app, agent, request.app.state.settings, request.app.state.flow_env)
    return _agent_view(agent, request.app.state.default_agent_id)


@router.patch("/{agent_id}")
def patch_agent(
    agent_id: int, body: AgentPatch, request: Request, db: Session = Depends(get_db), _: dict = Depends(require_admin)
):
    agent = db.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    if body.enabled is False and agent.id == request.app.state.default_agent_id:
        raise HTTPException(status_code=409, detail="默认 Agent 不可禁用")
    if body.description is not None:
        agent.description = body.description
    if body.enabled is not None:
        agent.enabled = body.enabled
    if body.layer is not None:
        agent.layer = body.layer
    if body.layer == "service":
        agent.network_domain = None
    elif body.networkDomain is not None:
        agent.network_domain = body.networkDomain
    db.commit()
    if body.enabled and agent.id != request.app.state.default_agent_id and agent.id not in request.app.state.agent_runtimes:
        from ..main import _mount_agent

        _mount_agent(request.app, agent, request.app.state.settings, request.app.state.flow_env)
    return _agent_view(agent, request.app.state.default_agent_id)


@router.delete("/{agent_id}")
def delete_agent(agent_id: int, request: Request, db: Session = Depends(get_db), _: dict = Depends(require_admin)):
    agent = db.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    if agent.id == request.app.state.default_agent_id:
        raise HTTPException(status_code=409, detail="默认 Agent 不可删除")
    agent.enabled = False
    db.commit()
    return _agent_view(agent, request.app.state.default_agent_id)
