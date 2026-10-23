"""Mock Agent 打桩实例管理 API（单进程单端口：实例挂载为主服务进程内运行时）。

- GET    /api/v1/mock-instances               实例列表（含挂载状态/Agent 行映射）
- POST   /api/v1/mock-instances/{id}/start    挂载实例运行时到主服务路径（同进程同端口）
- POST   /api/v1/mock-instances/{id}/stop     卸载实例运行时
- GET    /api/v1/mock-instances/{id}/logs     读取实例工作目录日志尾部
- GET    /api/v1/mock-instances/{id}/card     返回实例 AgentCard（挂载时构建）

实例 A2A 端点 = 主服务原生路由 /api/v1/mock-instances/{id}/a2a/*（公开，与
/debug/a2a 一致的 agent 公开面），无需任何转发；跨端页面（场景演示框架等）
以同源方式直接调用。未挂载的实例该路径返回 404，由调用方自行回退。
"""
import json
import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy import select

from ..auth import get_current_user, require_admin
from ..instance_runtime import (
    get_runtime,
    instance_mount_path,
    is_mounted,
    mount_instance,
    unmount_instance,
)
from ..models import Agent

router = APIRouter(prefix="/api/v1/mock-instances", tags=["mock-instances"])

DEFINE_FILENAME = "mock_agent_define.json"


def resolve_define_path() -> Path:
    candidates = []
    override = os.environ.get("OPENAN_DEBUG_MOCK_DEFINE")
    if override:
        candidates.append(Path(override))
    cwd = Path.cwd()
    server_dir = Path(__file__).resolve().parents[2]
    candidates += [
        cwd / "config" / DEFINE_FILENAME,
        cwd / DEFINE_FILENAME,
        cwd.parent / "config" / DEFINE_FILENAME,
        cwd.parent / DEFINE_FILENAME,
        server_dir / "config" / DEFINE_FILENAME,
        server_dir.parent / "config" / DEFINE_FILENAME,
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise HTTPException(status_code=404, detail=f"未找到 {DEFINE_FILENAME}（可用 OPENAN_DEBUG_MOCK_DEFINE 指定路径）")


def _load_define(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=f"实例定义文件解析失败：{exc}")


def _instance_by_id(define: dict, instance_id: str) -> dict:
    instance = next((item for item in define.get("instances", []) if item.get("id") == instance_id), None)
    if instance is None:
        raise HTTPException(status_code=404, detail=f"实例 {instance_id!r} 未定义")
    return instance


def _agent_id_for(request: Request, organization: str, name: str) -> int | None:
    try:
        from sqlalchemy.orm import Session

        with Session(request.app.state.engine) as session:
            agent = session.scalar(
                select(Agent).where(Agent.organization == organization, Agent.name == name)
            )
            return agent.id if agent else None
    except Exception:
        return None


def _instance_view(request: Request, define: dict, instance: dict) -> dict:
    entry = get_runtime(instance["id"])
    mounted = entry is not None
    llm = {**(define.get("defaults", {}).get("llm") or {}), **(instance.get("llm") or {})}
    return {
        "id": instance["id"],
        "name": instance.get("agentName") or instance.get("name"),
        "organization": instance.get("organization", "OpenAN"),
        "description": instance.get("description", ""),
        "port": int(instance.get("port", 9300)),  # 兼容保留：进程内模式不再监听该端口（仅独立进程模式使用）
        "endpoint": instance_mount_path(instance["id"]),
        "workDir": instance.get("workDir", ""),
        "layer": instance.get("layer", "service"),
        "networkDomain": instance.get("networkDomain"),
        "autoStart": bool(instance.get("autoStart")),
        "llm": {
            "enabled": bool(llm.get("enabled")),
            "provider": llm.get("provider"),
            "baseUrl": llm.get("baseUrl"),
            "model": llm.get("model"),
            "apiKeyEnv": llm.get("apiKeyEnv"),
        },
        "stubVariantCount": len(instance.get("stubVariants") or []),
        "workflow": {
            "enabled": bool((instance.get("workflow") or {}).get("enabled")),
            "workflowId": (instance.get("workflow") or {}).get("workflowId"),
        },
        "running": mounted,
        "healthy": mounted,
        "mounted": mounted,
        "mode": "in-process",
        "pid": None,
        "agentId": (entry.get("agent_id") if entry else None)
        or _agent_id_for(request, instance.get("organization", "OpenAN"), instance.get("agentName") or instance.get("name")),
    }


@router.get("")
def list_instances(request: Request, _: dict = Depends(get_current_user)):
    define_path = resolve_define_path()
    define = _load_define(define_path)
    return {
        "definePath": str(define_path),
        "instances": [_instance_view(request, define, item) for item in define.get("instances", [])],
    }


def _work_dir(instance: dict) -> Path:
    return Path(instance["workDir"])


def _log_tail(instance: dict, lines: int) -> str:
    log_file = _work_dir(instance) / "instance.log"
    if not log_file.exists():
        return ""
    return "\n".join(log_file.read_text(encoding="utf-8", errors="replace").splitlines()[-lines:])


@router.post("/{instance_id}/start")
def start_instance(instance_id: str, request: Request, _: dict = Depends(require_admin)):
    define_path = resolve_define_path()
    define = _load_define(define_path)
    instance = _instance_by_id(define, instance_id)
    if is_mounted(instance_id):
        raise HTTPException(status_code=409, detail="实例已挂载（进程内运行时）")
    try:
        entry = mount_instance(
            request.app, instance, define, request.app.state.settings, engine=request.app.state.engine
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"实例挂载失败：{exc}")
    return {
        "status": "running",
        "id": instance_id,
        "mode": "in-process",
        "endpoint": instance_mount_path(instance_id),
        "agentId": entry["agent_id"],
    }


@router.post("/{instance_id}/stop")
def stop_instance(instance_id: str, request: Request, _: dict = Depends(require_admin)):
    define = _load_define(resolve_define_path())
    instance = _instance_by_id(define, instance_id)
    stopped = unmount_instance(request.app, instance_id, instance=instance)
    if not stopped:
        return {"status": "stopped", "id": instance_id, "note": "实例本就未挂载"}
    return {"status": "stopped", "id": instance_id}


@router.get("/{instance_id}/logs", response_class=PlainTextResponse)
def instance_logs(instance_id: str, lines: int = 100, _: dict = Depends(get_current_user)):
    define = _load_define(resolve_define_path())
    instance = _instance_by_id(define, instance_id)
    return _log_tail(instance, max(1, min(lines, 500))) or "(暂无日志)"


@router.get("/{instance_id}/card")
def instance_card(instance_id: str, _: dict = Depends(get_current_user)):
    entry = get_runtime(instance_id)
    if entry is None:
        raise HTTPException(status_code=409, detail=f"实例 {instance_id} 未挂载，请先在 设置>Mock Agent管理 启动")
    return entry["card"]
