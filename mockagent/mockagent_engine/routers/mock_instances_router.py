"""Mock Agent 打桩实例管理 API。

- GET    /api/v1/mock-instances               实例列表（含运行状态/健康探测/Agent 行映射）
- POST   /api/v1/mock-instances/{id}/start    以子进程拉起独立实例（standalone_agent runner）
- POST   /api/v1/mock-instances/{id}/stop     停止实例（含服务重启后的孤儿进程）
- GET    /api/v1/mock-instances/{id}/logs     读取实例工作目录日志尾部
- GET    /api/v1/mock-instances/{id}/card     代理获取实例 AgentCard（避免浏览器跨端口直连）

实例定义来自 agents/<id>/agent.json（每个 Agent 一个目录），共享基线 agents/_defaults.json。
"""
import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy import select

from .. import agent_registry
from ..auth import get_current_user, require_admin
from ..models import Agent

router = APIRouter(prefix="/api/v1/mock-instances", tags=["mock-instances"])

_PROCESSES: dict[str, subprocess.Popen] = {}
_LOCK = threading.Lock()


def _load_define(path: Path | None = None) -> dict:
    """聚合 agents/ 目录为 define 形态（{"defaults", "instances"}），供本路由与其它路由使用。"""
    return agent_registry.load_define()


def _instance_by_id(define: dict, instance_id: str) -> dict:
    instance = next((item for item in define.get("instances", []) if item.get("id") == instance_id), None)
    if instance is None:
        raise HTTPException(status_code=404, detail=f"实例 {instance_id!r} 未定义")
    return instance


def _health_probe(port: int, timeout: float = 1.0) -> bool:
    try:
        response = httpx.get(f"http://127.0.0.1:{port}/health", timeout=timeout)
        return response.status_code == 200
    except Exception:
        return False


def _pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    if os.name == "nt":
        try:
            out = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}"], capture_output=True, text=True, timeout=10
            ).stdout
            return str(pid) in out
        except Exception:
            return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def _managed_running(instance_id: str) -> bool:
    proc = _PROCESSES.get(instance_id)
    return proc is not None and proc.poll() is None


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
    port = int(instance.get("port", 9300))
    managed = _managed_running(instance["id"])
    healthy = _health_probe(port)
    pid = None
    if managed:
        pid = _PROCESSES[instance["id"]].pid
    else:
        pid_file = Path(instance.get("workDir", "")) / "instance.pid" if instance.get("workDir") else None
        if pid_file and pid_file.exists():
            try:
                pid = int(pid_file.read_text(encoding="utf-8").strip())
            except (OSError, ValueError):
                pid = None
    llm = {**(define.get("defaults", {}).get("llm") or {}), **(instance.get("llm") or {})}
    try:
        agent_type = agent_registry.load_agent_class(agent_registry.agents_dir() / instance["id"]).agent_type
    except Exception:
        agent_type = "generic"
    return {
        "id": instance["id"],
        "name": instance.get("agentName") or instance.get("name"),
        "organization": instance.get("organization", "OpenAN"),
        "description": instance.get("description", ""),
        "port": port,
        "endpoint": f"http://127.0.0.1:{port}",
        "workDir": instance.get("workDir", ""),
        "layer": instance.get("layer", "service"),
        "networkDomain": instance.get("networkDomain"),
        "autoStart": bool(instance.get("autoStart")),
        "agentType": agent_type,
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
        "running": bool(managed or (pid and _pid_alive(pid) and healthy)),
        "healthy": healthy,
        "pid": pid,
        "agentId": _agent_id_for(request, instance.get("organization", "OpenAN"), instance.get("agentName") or instance.get("name")),
    }


@router.get("")
def list_instances(request: Request, _: dict = Depends(get_current_user)):
    define = _load_define()
    return {
        "definePath": str(agent_registry.agents_dir()),
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
    define = _load_define()
    instance = _instance_by_id(define, instance_id)
    port = int(instance.get("port", 9300))
    with _LOCK:
        if _managed_running(instance_id):
            raise HTTPException(status_code=409, detail="实例已在本服务中运行")
        if _health_probe(port):
            raise HTTPException(status_code=409, detail=f"端口 {port} 已有实例在运行（可能是外部启动）")
        work_dir = _work_dir(instance)
        work_dir.mkdir(parents=True, exist_ok=True)
        log_file = open(work_dir / "instance.log", "ab")
        try:
            proc = subprocess.Popen(
                [
                    sys.executable, "-m", "mockagent_engine.standalone_agent",
                    "--agent", instance_id,
                ],
                cwd=str(Path(__file__).resolve().parents[1]),
                env=os.environ.copy(),
                stdout=log_file,
                stderr=subprocess.STDOUT,
            )
        except Exception as exc:
            log_file.close()
            raise HTTPException(status_code=500, detail=f"进程拉起失败：{exc}")
        _PROCESSES[instance_id] = proc
    deadline = time.time() + 20
    while time.time() < deadline:
        if proc.poll() is not None:
            _PROCESSES.pop(instance_id, None)
            tail = _log_tail(instance, 40)
            raise HTTPException(status_code=500, detail=f"实例进程退出（code={proc.returncode}）：\n{tail}")
        if _health_probe(port):
            return {"status": "running", "id": instance_id, "pid": proc.pid, "port": port}
        time.sleep(0.5)
    tail = _log_tail(instance, 40)
    raise HTTPException(status_code=504, detail=f"健康检查超时（20s）：\n{tail}")


@router.post("/{instance_id}/stop")
def stop_instance(instance_id: str, request: Request, _: dict = Depends(require_admin)):
    define = _load_define()
    instance = _instance_by_id(define, instance_id)
    stopped = False
    with _LOCK:
        proc = _PROCESSES.pop(instance_id, None)
        if proc is not None and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)
            stopped = True
    if not stopped:
        pid_file = _work_dir(instance) / "instance.pid"
        if pid_file.exists():
            try:
                pid = int(pid_file.read_text(encoding="utf-8").strip())
            except (OSError, ValueError):
                pid = 0
            if pid > 0 and _pid_alive(pid):
                if os.name == "nt":
                    subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True, timeout=15)
                else:
                    os.kill(pid, 9)
                stopped = True
        try:
            pid_file.unlink()
        except OSError:
            pass
    deadline = time.time() + 3
    while time.time() < deadline and _health_probe(int(instance.get("port", 9300)), timeout=0.5):
        time.sleep(0.3)
    if not stopped and not _health_probe(int(instance.get("port", 9300)), timeout=0.5):
        return {"status": "stopped", "id": instance_id, "note": "实例本就未在运行"}
    return {"status": "stopped", "id": instance_id}


@router.get("/{instance_id}/logs", response_class=PlainTextResponse)
def instance_logs(instance_id: str, lines: int = 100, _: dict = Depends(get_current_user)):
    define = _load_define()
    instance = _instance_by_id(define, instance_id)
    return _log_tail(instance, max(1, min(lines, 500))) or "(暂无日志)"


@router.get("/{instance_id}/card")
def instance_card(instance_id: str, _: dict = Depends(get_current_user)):
    define = _load_define()
    instance = _instance_by_id(define, instance_id)
    port = int(instance.get("port", 9300))
    try:
        response = httpx.get(f"http://127.0.0.1:{port}/.well-known/agent-card.json", timeout=3)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"实例不可达：{exc}")
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail=f"实例返回 HTTP {response.status_code}")
    return response.json()


def autostart_instances() -> None:
    """服务启动后拉起 define 中 autoStart=true 的实例（后台线程，失败仅记日志，不阻塞服务）。

    MOCK_AGENT_AUTOSTART（逗号分隔实例 id）设置时优先生效：为空串=不自动启动，
    非空=仅拉起列出的实例（ODA Canvas 部署按用户勾选注入）。
    """
    import logging
    import os

    def _run():
        try:
            define = _load_define()
        except Exception:
            return
        override = os.environ.get("MOCK_AGENT_AUTOSTART")
        if override is not None:
            wanted = {x.strip() for x in override.split(",") if x.strip()}
        else:
            wanted = None
        for instance in define.get("instances", []):
            if wanted is not None:
                if instance["id"] not in wanted:
                    continue
            elif not instance.get("autoStart"):
                continue
            instance_id = instance["id"]
            try:
                with _LOCK:
                    if _managed_running(instance_id) or _health_probe(int(instance.get("port", 9300))):
                        continue
                    work_dir = Path(instance["workDir"])
                    work_dir.mkdir(parents=True, exist_ok=True)
                    log_file = open(work_dir / "instance.log", "ab")
                    proc = subprocess.Popen(
                        [
                            sys.executable, "-m", "mockagent_engine.standalone_agent",
                            "--agent", instance_id,
                        ],
                        cwd=str(Path(__file__).resolve().parents[1]),
                        env=os.environ.copy(),
                        stdout=log_file,
                        stderr=subprocess.STDOUT,
                    )
                    _PROCESSES[instance_id] = proc
                deadline = time.time() + 20
                while time.time() < deadline and proc.poll() is None and not _health_probe(int(instance.get("port", 9300))):
                    time.sleep(0.5)
                logging.getLogger(__name__).info(
                    "autostart instance %s: pid=%s healthy=%s", instance_id, proc.pid, _health_probe(int(instance.get("port", 9300)))
                )
            except Exception:
                logging.getLogger(__name__).exception("autostart instance %s failed", instance_id)

    threading.Thread(target=_run, daemon=True).start()
