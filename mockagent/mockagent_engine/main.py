import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import select
from sqlalchemy.orm import Session

from .agent.a2a_app import build_a2a_app
from .agent.executor import MockAgentExecutor
from .agent.flow_env import FlowEnvironment
from .config import Settings, load_settings
from .db import init_db, make_engine
from .models import Agent, RequestLog
from .routers.agents_router import router as agents_router
from .routers.auth_router import router as auth_router
from .routers.console_router import router as console_router
from .routers.debug_proxy_router import router as debug_proxy_router
from .routers.history_router import router as history_router
from .routers.mock_instances_router import router as mock_instances_router
from .routers.oda_router import router as oda_router
from .routers.registry_router import router as registry_router
from .routers.scenarios_router import router as scenarios_router
from .routers.seeds_router import router as seeds_router
from .routers.settings_router import router as settings_router
from .routers.users_router import router as users_router
from .routers.variants_router import router as variants_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    from .routers.mock_instances_router import autostart_instances

    autostart_instances()
    yield
    app.state.engine.dispose()


async def _log_sink(runtime: dict, entry: dict) -> None:
    engine = runtime.get("engine")
    if engine is None:
        return

    def _write():
        with Session(engine) as session:
            session.add(RequestLog(**entry))
            session.commit()

    await asyncio.to_thread(_write)


def _public_base(url: str) -> str:
    suffix = "/debug/a2a"
    if url.endswith(suffix):
        return url[: -len(suffix)]
    return url


def _mount_agent(app: FastAPI, agent: Agent, settings: Settings, flow_env: FlowEnvironment) -> None:
    runtime = {"engine": app.state.engine, "agent_id": agent.id, "settings": settings, "dataset_templates": None, "instance_id": None, "llm_config": None, "workflow_config": None, "workflow_cards": []}
    app.state.agent_runtimes[agent.id] = runtime
    executor = MockAgentExecutor(flow_env, runtime, log_sink=lambda entry: _log_sink(app.state.runtime, entry))
    is_default = agent.id == app.state.default_agent_id
    mount_path = "/debug/a2a" if is_default else f"/debug/a2a/agent/{agent.id}"
    card_url = (
        settings.public_agent_url
        if is_default
        else f"{_public_base(settings.public_agent_url)}/debug/a2a/agent/{agent.id}"
    )
    app.mount(
        mount_path,
        build_a2a_app(card_url, executor, agent_name=agent.name, agent_description=agent.description),
    )
    if not is_default:
        routes = app.router.routes
        route = routes.pop()
        index = len(routes)
        for position, candidate in enumerate(routes):
            if getattr(candidate, "path", None) == "/debug/a2a":
                index = position
                break
        routes.insert(index, route)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    app = FastAPI(title="OpenAN-Debug", lifespan=lifespan)
    app.state.settings = settings
    app.state.runtime = {"engine": None, "agent_id": None, "settings": settings}
    app.state.agent_runtimes = {}
    app.state.flow_env = FlowEnvironment(settings)
    engine = make_engine(settings)
    init_db(engine, settings)
    app.state.engine = engine
    app.state.runtime["engine"] = engine
    with Session(engine) as session:
        app.state.default_agent_id = session.scalar(select(Agent.id).order_by(Agent.id).limit(1))
        app.state.runtime["agent_id"] = app.state.default_agent_id
        agents = session.scalars(select(Agent).order_by(Agent.id)).all()
    for agent in agents:
        if agent.id != app.state.default_agent_id and agent.enabled:
            _mount_agent(app, agent, settings, app.state.flow_env)
    if app.state.default_agent_id is not None:
        default_agent = next(agent for agent in agents if agent.id == app.state.default_agent_id)
        _mount_agent(app, default_agent, settings, app.state.flow_env)
    app.include_router(auth_router)
    app.include_router(users_router)
    app.include_router(seeds_router)
    app.include_router(variants_router)
    app.include_router(console_router)
    app.include_router(history_router)
    app.include_router(registry_router)
    app.include_router(settings_router)
    app.include_router(mock_instances_router)
    app.include_router(oda_router)
    app.include_router(debug_proxy_router)
    app.include_router(agents_router)
    app.include_router(scenarios_router)

    @app.get("/api/v1/health")
    async def health():
        return {"status": "ok"}

    @app.get("/healthz")
    async def healthz():
        """Kubernetes liveness 探针（免鉴权）。"""
        return {"status": "ok"}

    @app.get("/readyz")
    async def readyz():
        """Kubernetes readiness 探针（免鉴权，校验数据库可读）。"""
        try:
            with Session(app.state.engine) as session:
                session.scalar(select(Agent.id).limit(1))
            return {"status": "ok"}
        except Exception as error:
            from fastapi.responses import JSONResponse

            return JSONResponse(status_code=503, content={"status": "unavailable", "detail": str(error)})

    return app
