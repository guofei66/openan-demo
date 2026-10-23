"""Mock Agent 实例进程内运行时（单进程单端口架构）。

实例不再以 standalone_agent 子进程拉起，而是把每个实例的 A2A 应用直接挂载到
主服务路径 /api/v1/mock-instances/{id}/a2a，与内嵌默认 Agent 同进程同端口：

- 对外只暴露主服务一个端口：浏览器 / 场景演示框架 / 调测台全部走同源路径，
  不再占用 9005-9013 等内部端口（也彻底避免端口冲突）；
- 实例间派发（工作流 PSOP、调测台转发）经主服务端口回环，仍是真实 A2A
  HTTP 报文链路；
- 与主服务共用同一 SQLite 引擎与连接池（Agent 行 / 变体池 / RequestLog）；
- 每实例保留独立 workDir（llm.env / instance.log）与独立 FlowEnv（模型连接方案）；
- 工作流引擎 / SDK 只加载一份：内存占用从 主服务+每实例各一份 降到 单份。

standalone_agent.py 保留为可选的独立进程模式（需要「多进程」形态时使用）。
"""
from __future__ import annotations

import dataclasses
import json
import logging
import os
import threading
import time
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.routing import Mount

from . import workflow_mode
from .agent.a2a_app import build_a2a_app
from .agent.agent_card import build_agent_card_payload
from .agent.executor import MockAgentExecutor
from .agent.flow_env import FALLBACK_ENV, FlowEnvironment
from .llm_client import from_define
from .models import Agent, RequestLog, Variant

logger = logging.getLogger(__name__)

MOUNT_PREFIX = "/api/v1/mock-instances"

_RUNTIMES: dict[str, dict] = {}
_LOCK = threading.Lock()


def service_base_url(settings) -> str:
    """主服务回环基址（从 agent_internal_url 推导，随实际监听端口走）。"""
    url = settings.agent_internal_url
    suffix = "/debug/a2a/message:send"
    if url.endswith(suffix):
        return url[: -len(suffix)]
    return url.rstrip("/")


def instance_mount_path(instance_id: str) -> str:
    """实例 A2A 应用在主服务内的挂载路径（即对外唯一 A2A 路径）。"""
    return f"{MOUNT_PREFIX}/{instance_id}/a2a"


def is_mounted(instance_id: str) -> bool:
    return instance_id in _RUNTIMES


def get_runtime(instance_id: str) -> dict | None:
    return _RUNTIMES.get(instance_id)


def mounted_ids() -> list[str]:
    return list(_RUNTIMES)


# ---------------------------------------------------------------- 实例构建（与 standalone 共用的装配逻辑）

def merged_llm(instance: dict, define: dict) -> dict:
    return {**(define.get("defaults", {}).get("llm") or {}), **(instance.get("llm") or {})}


def merged_stub_variants(instance: dict, define: dict) -> list:
    """实例桩在前、defaults 基线补齐：实例同模板条目优先（覆盖基线），保证覆盖调测台全部模板能力。"""
    baseline = define.get("defaults", {}).get("stubVariants") or []
    own = instance.get("stubVariants") or []
    own_templates = {item.get("templateUri") for item in own}
    return [*own, *[item for item in baseline if item.get("templateUri") not in own_templates]]


def write_llm_env(instance: dict, define: dict, work_dir: Path) -> Path:
    llm = merged_llm(instance, define)
    env_path = work_dir / "llm.env"
    if not llm.get("enabled"):
        env_path.write_text(FALLBACK_ENV, encoding="utf-8")
        return env_path
    api_key = os.environ.get(llm.get("apiKeyEnv") or "", "dummy") or "dummy"
    content = (
        f"A2AT_LLM_PROVIDER={llm.get('provider', 'openai')}\n"
        f"A2AT_LLM_MODEL={llm.get('model', 'dummy')}\n"
        f"A2AT_LLM_API_KEY={api_key}\n"
        f"A2AT_LLM_BASE_URL={llm.get('baseUrl', 'http://127.0.0.1:9')}\n"
        f"A2AT_LLM_MAX_ATTEMPTS={int(llm.get('maxAttempts', 1))}\n"
        f"A2AT_LANGUAGE={llm.get('language', 'zh-CN')}\n"
    )
    env_path.write_text(content, encoding="utf-8")
    return env_path


def make_log_sink(engine):
    """实例执行器的 RequestLog 落库回调（共用主服务引擎）。"""
    import asyncio

    async def _log_sink(entry: dict) -> None:
        def _write():
            with Session(engine) as session:
                session.add(RequestLog(**entry))
                session.commit()

        await asyncio.to_thread(_write)

    return _log_sink


def ensure_agent(session: Session, instance: dict) -> int:
    organization = instance.get("organization", "OpenAN")
    name = instance.get("agentName") or instance["name"]
    agent = session.scalar(select(Agent).where(Agent.organization == organization, Agent.name == name))
    if agent is None:
        agent = Agent(
            organization=organization,
            name=name,
            description=instance.get("description", ""),
            enabled=True,
            layer=instance.get("layer", "service"),
            network_domain=instance.get("networkDomain"),
        )
        session.add(agent)
        session.commit()
        session.refresh(agent)
        logger.info("created agent row id=%s (%s/%s) for instance %s", agent.id, organization, name, instance.get("id"))
    elif not agent.enabled:
        agent.enabled = True
        session.commit()
    return agent.id


def ensure_stub_variants(session: Session, agent_id: int, stub_variants: list | None) -> int:
    if not stub_variants:
        return 0
    # 先取该 Agent 已有模板集合再统一插入：避免循环内 add+查询触发 autoflush，把同模板后续变体误判为已存在
    existing = set(
        session.scalars(select(Variant.template_uri).where(Variant.agent_id == agent_id)).all()
    )
    from sqlalchemy import func

    seq_counters: dict[str, int] = {}
    created = 0
    for item in stub_variants:
        template_uri = item["templateUri"]
        if template_uri in existing:
            continue
        if template_uri not in seq_counters:
            seq_counters[template_uri] = session.scalar(
                select(func.coalesce(func.max(Variant.seq) + 1, 0)).where(
                    Variant.agent_id == agent_id, Variant.template_uri == template_uri
                )
            )
        session.add(
            Variant(
                seed_id=None,
                agent_id=agent_id,
                template_uri=template_uri,
                variant_json=item["variantJson"],
                enabled=True,
                source="mock_define",
                seq=seq_counters[template_uri],
            )
        )
        seq_counters[template_uri] += 1
        created += 1
    if created:
        session.commit()
        logger.info("imported %s stub variants for agent %s", created, agent_id)
    return created


def build_instance_runtime(instance: dict, define: dict, settings, *, engine=None) -> dict:
    """构建单个实例的进程内运行时（A2A 应用 + 执行器 runtime + AgentCard）。

    engine 传入主服务引擎时与其共用连接池（进程内模式）；
    不传时自建引擎（standalone 独立进程模式）。
    """
    from .db import init_db, make_engine

    work_dir = Path(instance["workDir"])
    work_dir.mkdir(parents=True, exist_ok=True)
    llm_env = write_llm_env(instance, define, work_dir)

    owns_engine = engine is None
    if owns_engine:
        engine = make_engine(settings)
        init_db(engine, settings)
        from sqlalchemy import text

        with engine.connect() as conn:
            conn.execute(text("PRAGMA journal_mode=WAL"))
            conn.commit()
    with Session(engine) as session:
        agent_id = ensure_agent(session, instance)
        ensure_stub_variants(session, agent_id, merged_stub_variants(instance, define))

    llm = merged_llm(instance, define)
    flow_settings = dataclasses.replace(settings, env_path=llm_env, language=llm.get("language", settings.language))
    flow_env = FlowEnvironment(flow_settings)
    workflow_cfg = instance.get("workflow") or None
    workflow_dict = None
    workflow_cards: list = []
    if workflow_cfg and workflow_cfg.get("enabled"):
        workflow_dict = workflow_mode.load_builtin(workflow_cfg.get("workflowId") or "live-assurance-demo")
        if workflow_dict:
            # 派发目标 = 主服务内挂载路径（同端口回环，仍是真实 A2A HTTP 报文）
            workflow_cards = workflow_mode.agent_cards_for(workflow_dict, define, service_base_url(settings))

    runtime = {
        "engine": engine,
        "agent_id": agent_id,
        "settings": settings,
        "dataset_templates": instance.get("datasetTemplates") or None,
        "instance_id": instance.get("id"),
        "llm_config": from_define(merged_llm(instance, define)),
        "workflow_config": workflow_cfg,
        "workflow_cards": workflow_cards,
    }
    executor = MockAgentExecutor(flow_env, runtime, log_sink=make_log_sink(engine))

    name = instance.get("agentName") or instance["name"]
    base = service_base_url(settings)
    public_path = instance_mount_path(instance["id"])
    public_url = instance.get("publicUrl") or f"{base}{public_path}"
    a2a_app = build_a2a_app(public_url, executor, agent_name=name, agent_description=instance.get("description"))

    return {
        "instance_id": instance["id"],
        "agent_id": agent_id,
        "engine": engine,
        "owns_engine": owns_engine,
        "flow_env": flow_env,
        "runtime": runtime,
        "a2a_app": a2a_app,
        "card": build_agent_card_payload(public_url, name=name, description=instance.get("description")),
        "public_url": public_url,
        "mounted_at": None,
    }


# ---------------------------------------------------------------- 挂载 / 卸载

def _append_instance_log(instance: dict, message: str) -> None:
    try:
        work_dir = Path(instance["workDir"])
        work_dir.mkdir(parents=True, exist_ok=True)
        with open(work_dir / "instance.log", "a", encoding="utf-8") as fh:
            fh.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {message}\n")
    except OSError:
        logger.exception("append instance log failed")


def mount_instance(app, instance: dict, define: dict, settings, *, engine=None) -> dict:
    """把实例 A2A 应用挂载到主服务路径（同进程同端口对外服务）。"""
    instance_id = instance["id"]
    with _LOCK:
        if instance_id in _RUNTIMES:
            raise RuntimeError(f"实例 {instance_id} 已挂载")
        entry = build_instance_runtime(instance, define, settings, engine=engine)
        mount_path = instance_mount_path(instance_id)
        app.mount(mount_path, entry["a2a_app"])
        entry["mounted_at"] = time.time()
        _RUNTIMES[instance_id] = entry
    _append_instance_log(instance, f"[instance-runtime] mounted {mount_path} (agentId={entry['agent_id']}, in-process)")
    logger.info("mock instance %s mounted at %s (in-process)", instance_id, mount_path)
    return entry


def unmount_instance(app, instance_id: str, *, instance: dict | None = None) -> bool:
    """卸载实例运行时（移除挂载路由；共用引擎不关闭，自建引擎则释放）。"""
    with _LOCK:
        entry = _RUNTIMES.pop(instance_id, None)
        if entry is None:
            return False
        mount_path = instance_mount_path(instance_id)
        for route in list(app.router.routes):
            if isinstance(route, Mount) and route.path == mount_path:
                app.router.routes.remove(route)
        if entry.get("owns_engine"):
            try:
                entry["engine"].dispose()
            except Exception:
                logger.exception("dispose engine for instance %s failed", instance_id)
    if instance is not None:
        _append_instance_log(instance, f"[instance-runtime] unmounted {mount_path}")
    logger.info("mock instance %s unmounted", instance_id)
    return True


def autostart_instances(app) -> None:
    """服务启动时把 define 中 autoStart=true 的实例挂载为进程内运行时（失败仅记日志，不阻塞服务）。

    OPENAN_DEBUG_AUTOSTART（逗号分隔实例 id）设置时优先生效：为空串=不自动启动，
    非空=仅挂载列出的实例（ODA Canvas 部署按用户勾选注入）。
    """
    # 延迟导入避免与 router 模块循环依赖（本函数仅在 lifespan 阶段调用）
    from .routers.mock_instances_router import _load_define, resolve_define_path

    try:
        define_path = resolve_define_path()
        define = _load_define(define_path)
    except Exception:
        logger.exception("autostart: define 加载失败")
        return
    wanted_raw = os.environ.get("OPENAN_DEBUG_AUTOSTART")
    wanted = {item.strip() for item in wanted_raw.split(",") if item.strip()} if wanted_raw is not None else None
    settings = app.state.settings
    engine = app.state.engine
    mounted: list[str] = []
    for instance in define.get("instances", []):
        if wanted is not None:
            if instance["id"] not in wanted:
                continue
        elif not instance.get("autoStart"):
            continue
        try:
            if is_mounted(instance["id"]):
                continue
            mount_instance(app, instance, define, settings, engine=engine)
            mounted.append(instance["id"])
        except Exception:
            logger.exception("autostart instance %s failed", instance["id"])
    if mounted:
        logger.info("autostart mounted %s in-process instance(s): %s", len(mounted), ", ".join(mounted))


def describe() -> str:
    """进程内运行时概况（调试用）。"""
    return json.dumps({"mounted": mounted_ids()}, ensure_ascii=False)
