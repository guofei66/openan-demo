# -*- coding: utf-8 -*-
"""场景接口：场景 = 故事线描述 + PSOP 工作流 + 智能体清单。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import agent_registry, scenario_registry, workflow_mode
from ..auth import get_current_user
from ..deps import get_db

router = APIRouter(prefix="/api/v1/scenarios", tags=["scenarios"])


def _agent_brief(agent_id: str) -> dict:
    try:
        d = agent_registry.resolve_agent_dir(agent_id)
        cfg = agent_registry.load_agent(d)
        return {
            "id": agent_id,
            "name": cfg.get("agentName") or cfg.get("name"),
            "port": cfg.get("port"),
            "endpoint": f"http://127.0.0.1:{cfg.get('port')}",
            "agentType": agent_registry.load_agent_class(d).agent_type,
        }
    except (FileNotFoundError, TypeError):
        return {"id": agent_id, "name": None, "port": None, "endpoint": None, "agentType": "generic"}


@router.get("")
def list_scenarios(_: dict = Depends(get_current_user)):
    return {"scenarios": scenario_registry.list_scenarios()}


@router.get("/{scenario_id}")
def scenario_detail(scenario_id: str, _: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        d = scenario_registry.resolve_scenario_dir(scenario_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    data = scenario_registry.load_scenario(d)
    story = data["scenario"]
    agents_cfg = data["agents"]
    workflow = data["workflow"]
    detail = {
        "id": story.get("id") or d.name,
        "name": story.get("name", ""),
        "nameEn": story.get("nameEn", ""),
        "description": story.get("description", ""),
        "storyline": story.get("storyline") or {},
        "entry": story.get("entry") or {},
        "workflow": {
            "id": workflow.get("id"),
            "name": workflow.get("name", ""),
            "steps": [
                {"name": s.get("name"), "type": s.get("type"), "agent": s.get("agent")}
                for s in workflow.get("steps", [])
            ],
        },
        "agents": [
            {
                "id": a.get("id"),
                "role": a.get("role", "participant"),
                "required": bool(a.get("required", True)),
                "description": a.get("description", ""),
                "agent": _agent_brief(a.get("id")),
            }
            for a in agents_cfg.get("agents", [])
        ],
        "availableWorkflows": [w["id"] for w in workflow_mode.list_builtin()],
    }
    return detail
