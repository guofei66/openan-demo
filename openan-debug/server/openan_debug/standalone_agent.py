"""独立 Mock Agent 实例 runner（打桩 Agent 子进程入口）。

由 mock-instances 管理 API 以子进程方式拉起：
    python -m openan_debug.standalone_agent --define config/mock_agent_define.json --instance <id>

设计要点：
- 实例声明来自 mock_agent_define.json：端口 / 工作目录 / 模型连接方案（A2AT_LLM_*）/ Agent 信息 / 初始桩变体；
- 与主调试服务共用同一 SQLite（Agent 行、变体池、历史联调记录 RequestLog），便于在调测台统一管理；
- 模型连接方案写入 <工作目录>/llm.env，实例的 FlowEnvironment/A2ATServer 以该文件构造；
  llm.enabled=false 时写入 dummy 方案（即"LLM-less fallback mode"纯打桩）；
- 启动时按 organization+agentName 定位（或创建）Agent 行；stubVariants 仅在该实例
  对应模板尚无任何变体时导入，不覆盖种子页手工维护的内容。
"""
import argparse
import asyncio
import dataclasses
import json
import os
import sys
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from .agent.a2a_app import build_a2a_app
from .agent.executor import MockAgentExecutor
from .agent.flow_env import FALLBACK_ENV, FlowEnvironment
from .config import load_settings
from .db import init_db, make_engine
from .llm_client import from_define
from .models import Agent, RequestLog, Variant
from . import workflow_mode

DEFINE_FILENAME = "mock_agent_define.json"


def resolve_define_path(explicit: str | None) -> Path:
    candidates = []
    if explicit:
        candidates.append(Path(explicit))
    override = os.environ.get("OPENAN_DEBUG_MOCK_DEFINE")
    if override:
        candidates.append(Path(override))
    cwd = Path.cwd()
    candidates += [
        cwd / "config" / DEFINE_FILENAME,
        cwd / DEFINE_FILENAME,
        cwd.parent / "config" / DEFINE_FILENAME,
        cwd.parent / DEFINE_FILENAME,
        Path(__file__).resolve().parents[2] / "config" / DEFINE_FILENAME,
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise SystemExit(f"未找到 {DEFINE_FILENAME}；可用 --define 或 OPENAN_DEBUG_MOCK_DEFINE 指定路径")


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


async def _log_sink(engine, entry: dict) -> None:
    def _write():
        with Session(engine) as session:
            session.add(RequestLog(**entry))
            session.commit()

    await asyncio.to_thread(_write)


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
        print(f"[standalone-agent] 已创建 Agent 行 id={agent.id} ({organization}/{name})", flush=True)
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
        print(f"[standalone-agent] 已导入初始桩变体 {created} 个", flush=True)
    return created


def build_runner_app(instance: dict, define: dict, settings) -> FastAPI:
    work_dir = Path(instance["workDir"])
    work_dir.mkdir(parents=True, exist_ok=True)
    llm_env = write_llm_env(instance, define, work_dir)

    engine = make_engine(settings)
    init_db(engine, settings)
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
            workflow_cards = workflow_mode.agent_cards_for(workflow_dict, define)

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
    executor = MockAgentExecutor(flow_env, runtime, log_sink=lambda entry: _log_sink(engine, entry))

    name = instance.get("agentName") or instance["name"]
    port = int(instance.get("port", 9300))
    public_url = instance.get("publicUrl") or f"{define.get('defaults', {}).get('publicUrlBase', 'http://127.0.0.1')}:{port}"
    a2a_app = build_a2a_app(public_url, executor, agent_name=name, agent_description=instance.get("description"))

    app = FastAPI(title=f"Mock Agent · {name}")

    @app.get("/health")
    @app.get("/api/v1/health")
    async def health():
        return {
            "status": "ok",
            "instance": instance.get("id"),
            "agentId": agent_id,
            "llm": "enabled" if llm.get("enabled") else "stub-fallback",
        }

    app.mount("/", a2a_app)
    app.state.mock_instance = {"id": instance.get("id"), "agentId": agent_id, "workDir": str(work_dir)}
    return app


def main() -> None:
    parser = argparse.ArgumentParser(description="OpenAN-Debug standalone mock agent instance")
    parser.add_argument("--define", default=None, help="mock_agent_define.json 路径")
    parser.add_argument("--instance", required=True, help="实例 id")
    parser.add_argument("--host", default=None, help="覆盖实例 host")
    parser.add_argument("--port", type=int, default=None, help="覆盖实例 port")
    args = parser.parse_args()

    define_path = resolve_define_path(args.define)
    define = json.loads(define_path.read_text(encoding="utf-8"))
    instance = next((item for item in define.get("instances", []) if item.get("id") == args.instance), None)
    if instance is None:
        raise SystemExit(f"实例 {args.instance!r} 未在 {define_path} 中定义")

    settings = load_settings()
    host = args.host or instance.get("host") or define.get("defaults", {}).get("host", "0.0.0.0")
    port = args.port or int(instance.get("port", 9300))
    instance = {**instance, "host": host, "port": port}

    app = build_runner_app(instance, define, settings)
    work_dir = Path(instance["workDir"])
    (work_dir / "instance.pid").write_text(str(os.getpid()), encoding="utf-8")
    name = instance.get("agentName") or instance["name"]
    print(
        f"[standalone-agent] 实例 {instance['id']} ({name}) 启动：http://{host}:{port} "
        f"workDir={work_dir} define={define_path}",
        flush=True,
    )
    try:
        uvicorn.run(app, host=host, port=port, log_level="info")
    finally:
        pid_file = work_dir / "instance.pid"
        if pid_file.exists():
            pid_file.unlink()


if __name__ == "__main__":
    main()
