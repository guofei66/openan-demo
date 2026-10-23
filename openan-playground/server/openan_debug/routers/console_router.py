import json
import time
from importlib import resources as importlib_resources

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..agent.flow_env import ext_uri_for
from ..auth import get_current_user
from ..deps import get_db, get_settings
from ..models import Agent, RequestLog
from ..schemas import ConsoleSendRequest
from .mock_instances_router import _health_probe, _instance_by_id, _load_define, resolve_define_path

router = APIRouter(prefix="/api/v1/console", tags=["console"])

DEFAULT_EXTENSION = "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1"


def _local_base(url: str) -> str:
    suffix = "/debug/a2a/message:send"
    if url.endswith(suffix):
        return url[: -len(suffix)]
    return url


def _resolve_instance_target(db: Session, instance_id: str) -> tuple[str, int | None]:
    """调测台打桩实例目标：请求打到实例进程真实端口（与外部 SDK 客户端完全一致的链路）。"""
    define = _load_define(resolve_define_path())
    instance = _instance_by_id(define, instance_id)
    port = int(instance.get("port") or 0)
    if port <= 0 or not _health_probe(port):
        raise HTTPException(
            status_code=409,
            detail=f"打桩实例 {instance_id} 未运行，请先在 设置>Mock Agent管理 启动",
        )
    agent_id = None
    agent = db.execute(
        select(Agent).where(Agent.organization == instance.get("organization"), Agent.name == instance.get("name"), Agent.enabled == True)  # noqa: E712
    ).scalars().first()
    if agent is not None:
        agent_id = agent.id
    return f"http://127.0.0.1:{port}/message:send", agent_id


def _resolve_target(settings, db: Session, agent_id: int | None, default_agent_id: int | None) -> str:
    if agent_id is None:
        return settings.agent_internal_url
    agent = db.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    if agent.id == default_agent_id:
        return settings.agent_internal_url
    if not agent.enabled:
        raise HTTPException(status_code=409, detail="Agent 已禁用")
    return f"{_local_base(settings.agent_internal_url)}/debug/a2a/agent/{agent.id}/message:send"


def _derive_extension(request_body: dict) -> str:
    message = request_body.get("message") or {}
    metadata = message.get("metadata") or {}
    template_uri = metadata.get("templateUri")
    return ext_uri_for(template_uri) or DEFAULT_EXTENSION


def _extract_task_state(response_json) -> str | None:
    if not isinstance(response_json, dict):
        return None
    task = response_json.get("task")
    if not isinstance(task, dict):
        return None
    status = task.get("status")
    if not isinstance(status, dict):
        return None
    return status.get("state")


@router.post("/send")
async def console_send(
    body: ConsoleSendRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    settings=Depends(get_settings),
):
    log_agent_id = body.agentId
    if body.instanceId:
        target, log_agent_id = _resolve_instance_target(db, body.instanceId)
    else:
        target = _resolve_target(settings, db, body.agentId, request.app.state.default_agent_id)
    headers = {
        "A2A-Version": "1.0",
        "A2A-Extensions": _derive_extension(body.request),
        "Content-Type": "application/json",
    }
    started = time.monotonic()
    task_state = None
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(target, json=body.request, headers=headers)
    except httpx.HTTPError as e:
        latency_ms = int((time.monotonic() - started) * 1000)
        response_json = {"error": str(e)}
        response_status = 0
    else:
        latency_ms = int((time.monotonic() - started) * 1000)
        response_status = response.status_code
        try:
            response_json = response.json()
        except ValueError:
            response_json = {"raw": response.text}
        task_state = _extract_task_state(response_json)
    db.add(
        RequestLog(
            agent_id=log_agent_id or request.app.state.default_agent_id,
            template_uri=(body.request.get("message", {}).get("metadata", {}) or {}).get("templateUri"),
            direction="console",
            feature="a2at",
            request_body={"note": body.note, "request": body.request},
            response_body={"status": response_status, "response": response_json},
            task_state=task_state,
            negotiated=False,
            latency_ms=latency_ms,
            user_id=user["id"],
        )
    )
    db.commit()
    return {"status": response_status, "response": response_json, "latencyMs": latency_ms}


@router.get("/trace-prompts")
def trace_prompts(user: dict = Depends(get_current_user)):
    """实采报文中的真实 A2A-T 渲染 prompt（来自工作台 trace），供调测台示例填充。"""
    try:
        raw = importlib_resources.files("openan_debug").joinpath("trace_examples.json").read_text(encoding="utf-8")
        data = json.loads(raw)
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=f"实采 prompt 数据不可用：{exc}")
    return data


@router.get("/demo-dataset")
def demo_dataset(lang: str | None = None, user: dict = Depends(get_current_user)):
    """A2A-T Demo 实采数据集：请求-响应成对（来自 A2A-T Demo.docx 两单协作日志）。lang=en 时返回英文版。"""
    filename = _dataset_file_for("seed", lang)
    try:
        raw = importlib_resources.files("openan_debug").joinpath(filename).read_text(encoding="utf-8")
        data = json.loads(raw)
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=f"Demo 数据集不可用：{exc}")
    return data


_DATASET_LANG_FILES = {
    ("seed", "en"): "demo_dataset_en.json",
    ("expanded", "en"): "expanded_dataset_en.json",
}


def _dataset_file_for(ds_id: str, lang: str | None) -> str:
    """按语言选择数据集文件；英文版缺失时回退中文版。"""
    base = "demo_dataset.json" if ds_id == "seed" else "expanded_dataset.json"
    if lang == "en":
        en = _DATASET_LANG_FILES.get((ds_id, "en"))
        if en:
            try:
                _load_dataset_file(en)
                return en
            except (OSError, ValueError):
                pass
    return base


_DATASET_CACHE: dict = {}


def _agent_scopes() -> list[dict]:
    """各 Agent 的数据集关联范围：内嵌默认 Agent = 全部模板；实例 = define.datasetTemplates。"""
    define = _load_define(resolve_define_path())
    scopes: list[dict] = [{
        "agentId": None,
        "instanceId": None,
        "name": "内嵌默认 Agent",
        "port": None,
        "scoped": False,
        "datasetTemplates": None,
    }]
    for inst in define.get("instances", []):
        scopes.append({
            "agentId": None,
            "instanceId": inst.get("id"),
            "name": inst.get("name") or inst.get("id"),
            "port": inst.get("port"),
            "scoped": True,
            "datasetTemplates": inst.get("datasetTemplates") or [],
        })
    # 关联已启动实例的 Agent 行 id（org+name 匹配）
    return scopes


def _dataset_template_counts() -> dict[str, dict[str, int]]:
    counts: dict[str, dict[str, int]] = {}
    for ds_id, filename in (("seed", "demo_dataset.json"), ("expanded", "expanded_dataset.json")):
        try:
            data = _load_dataset_file(filename)
        except (OSError, ValueError):
            continue
        per: dict[str, int] = {}
        for p in data.get("pairs", []):
            tpl = p.get("templateUri")
            if tpl:
                per[tpl] = per.get(tpl, 0) + 1
        counts[ds_id] = per
    return counts


@router.get("/datasets/agent-associations")
def dataset_agent_associations(user: dict = Depends(get_current_user), db: Session = Depends(get_db), request: Request = None):
    """数据集与 Agent 的关联视图：每个 Agent 关联的模板及数据对数量。"""
    scopes = _agent_scopes()
    counts = _dataset_template_counts()
    default_agent_id = getattr(request.app.state, "default_agent_id", None) if request is not None else None
    agent_rows = db.execute(select(Agent)).scalars().all()
    result = []
    for sc in scopes:
        templates = sc.get("datasetTemplates")
        per_ds = {"seed": 0, "expanded": 0}
        per_template = []
        if templates is None:
            for ds_id in ("seed", "expanded"):
                per_ds[ds_id] = sum(counts.get(ds_id, {}).values())
            per_template = [{"templateUri": t, "seed": counts.get("seed", {}).get(t, 0), "expanded": counts.get("expanded", {}).get(t, 0)}
                            for t in sorted(counts.get("expanded", {}))]
            scoped = False
        else:
            for t in templates:
                se, ex = counts.get("seed", {}).get(t, 0), counts.get("expanded", {}).get(t, 0)
                per_template.append({"templateUri": t, "seed": se, "expanded": ex})
                per_ds["seed"] += se
                per_ds["expanded"] += ex
            scoped = True
        agent_row = None
        if sc.get("instanceId") is None:
            agent_row = next((a for a in agent_rows if a.id == default_agent_id), None)
        else:
            inst = next((i for i in _load_define(resolve_define_path()).get("instances", []) if i.get("id") == sc["instanceId"]), None)
            if inst is not None:
                agent_row = next(
                    (a for a in agent_rows if a.organization == inst.get("organization") and a.name == inst.get("name")),
                    None,
                )
        result.append({
            **{k: v for k, v in sc.items() if k != "datasetTemplates"},
            "agentRowId": agent_row.id if agent_row is not None else None,
            "agentEnabled": bool(agent_row.enabled) if agent_row is not None else False,
            "scoped": scoped,
            "templateCount": len(templates) if templates is not None else None,
            "pairCounts": per_ds,
            "templates": per_template,
        })
    return {"associations": result}


def _load_dataset_file(filename: str) -> dict:
    if filename not in _DATASET_CACHE:
        raw = importlib_resources.files("openan_debug").joinpath(filename).read_text(encoding="utf-8")
        _DATASET_CACHE[filename] = json.loads(raw)
    return _DATASET_CACHE[filename]


@router.get("/datasets")
def list_datasets(lang: str | None = None, user: dict = Depends(get_current_user)):
    """数据集清单：种子数据集（Demo 实采）+ 扩写数据集（全模板覆盖）。lang=en 时返回英文版元信息。"""
    result = []
    for ds_id in ("seed", "expanded"):
        try:
            data = _load_dataset_file(_dataset_file_for(ds_id, lang))
        except (OSError, ValueError):
            data = None
        if data:
            result.append({
                "id": ds_id,
                "name": data.get("name", ""),
                "source": data.get("source", ""),
                "note": data.get("note", ""),
                "pairCount": len(data.get("pairs", [])),
                "templateCounts": data.get("templateCounts") or {},
            })
    return {"datasets": result}


@router.get("/datasets/{ds_id}/pairs")
def dataset_pairs(
    ds_id: str,
    page: int = 1,
    page_size: int = Query(20, alias="pageSize"),
    protocol: str | None = None,
    template_uri: str | None = Query(None, alias="templateUri"),
    agent_id: int | None = Query(None, alias="agentId"),
    q: str | None = None,
    lang: str | None = None,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    """数据集对（分页 + 筛选；agentId 提供时按该 Agent 关联范围过滤）。lang=en 返回英文数据集。"""
    if ds_id not in ("seed", "expanded"):
        raise HTTPException(status_code=404, detail=f"未知数据集 {ds_id}")
    filename = _dataset_file_for(ds_id, lang)
    try:
        data = _load_dataset_file(filename)
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=f"数据集不可用：{exc}")
    pairs = data.get("pairs", [])
    scope_templates = None
    if agent_id is not None:
        default_agent_id = getattr(request.app.state, "default_agent_id", None) if request is not None else None
        if agent_id != default_agent_id:
            agent_row = db.get(Agent, agent_id)
            scope_templates = None
            if agent_row is not None:
                define = _load_define(resolve_define_path())
                inst = next(
                    (i for i in define.get("instances", []) if i.get("organization") == agent_row.organization and i.get("name") == agent_row.name),
                    None,
                )
                scope_templates = (inst or {}).get("datasetTemplates")
            if scope_templates:
                pairs = [p for p in pairs if p.get("templateUri") in scope_templates]
            else:
                pairs = []
    if protocol:
        pairs = [p for p in pairs if p.get("protocol") == protocol]
    if template_uri:
        pairs = [p for p in pairs if p.get("templateUri") == template_uri]
    if q:
        needle = q.strip().lower()
        if needle:
            def _match(p: dict) -> bool:
                for key in ("pairId", "scenario", "direction", "label", "requestPrompt", "responseText"):
                    if needle in str(p.get(key, "")).lower():
                        return True
                return False
            pairs = [p for p in pairs if _match(p)]
    page_size = max(1, min(100, page_size))
    total = len(pairs)
    page = max(1, page)
    start = (page - 1) * page_size
    items = pairs[start:start + page_size]
    # 列表页瘦身：prompt/响应只回前 160 字，展开时用完整字段接口或前端缓存
    slim = []
    for p in items:
        slim.append({**p, "requestPromptPreview": str(p.get("requestPrompt", ""))[:160], "responseTextPreview": str(p.get("responseText", ""))[:160]})
    return {
        "datasetId": ds_id,
        "total": total,
        "page": page,
        "pageSize": page_size,
        "agentScopeTemplates": scope_templates,
        "protocols": sorted({p.get("protocol") for p in data.get("pairs", []) if p.get("protocol")}),
        "templateUris": sorted({p.get("templateUri") for p in data.get("pairs", []) if p.get("templateUri")}),
        "items": slim,
    }


@router.get("/datasets/{ds_id}/pairs/{pair_id}")
def dataset_pair_detail(ds_id: str, pair_id: str, lang: str | None = None, user: dict = Depends(get_current_user)):
    """单个数据集对的完整内容（请求全文 + 响应全文）。lang=en 返回英文数据。"""
    if ds_id not in ("seed", "expanded"):
        raise HTTPException(status_code=404, detail=f"未知数据集 {ds_id}")
    filename = _dataset_file_for(ds_id, lang)
    try:
        data = _load_dataset_file(filename)
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=f"数据集不可用：{exc}")
    for p in data.get("pairs", []):
        if p.get("pairId") == pair_id:
            return p
    raise HTTPException(status_code=404, detail=f"对 {pair_id} 不存在")
