# OpenAN-Debug 系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建 OpenAN-Debug 系统：A2A-T Mock Agent（完整协议流程：校验→参数抽取→Negotiation-T 协商→打桩 Artifact）+ 带登录的调试 Web 系统（种子/变体管理、联调调试台、请求历史）+ 阿里云部署。

**Architecture:** 单体 FastAPI 应用（监听 127.0.0.1:9000）同时承载 Debug API（`/api/v1/*`）与挂载在 `/debug/a2a` 的 A2A Starlette 子应用（官方 a2a-sdk REST handler + a2a-t-sdk-python 校验）。SQLite 存储，React+Vite 前端由 Nginx 托管。设计文档：`docs/superpowers/specs/2026-09-28-openan-debug-design.md`。

**Tech Stack:** Python 3.12+ / FastAPI / a2a-sdk==1.1.0 / a2a-t-sdk（本地路径依赖，wheel 化部署）/ SQLAlchemy 2 / PyJWT / React 18 + Vite / SQLite / systemd + Nginx（阿里云 47.120.10.111）

---

## 实施者必读：已核实的关键事实

以下事实已从源码逐一核实，实施时**直接信任，不要重新发明**：

1. **a2a-t-sdk**（本地仓库 `D:\OpenAN-Github\a2a-t-sdk-python`，PyPI 包名 `a2a-t-sdk`，模块名 `a2a_t`，版本 1.1.0，要求 Python>=3.12）：
   - `A2ATServer(env_path: Path | None = None)`（keyword-only）。`env_path` 指向 .env 文件；不存在的路径会抛 `ConfigFileNotFoundError`。
   - `check_task_prompt(*, processed_prompt_text: str) -> PromptComplianceResult`；结果 `.success`，失败时 `.failure.code/.message/.stage`（stage: input_gate/prompt_parse/semantic_validation 等）。LLM 故障可能以返回失败（code `llm.*`）或抛 `A2ATError` 两种形式出现，两种都要处理。
   - `validate_task_prompt_and_data_filling(prompt, schema, template_uri) -> FilledParamData`（`.data` 为参数 dict；协商模板会混入 `id/round/maxRounds` 上下文键）。Notification/Authorization/Negotiation 同形方法：`validate_notification_prompt_and_data_filling`、`validate_auth_prompt_and_data_filling`、`validate_{propose,accept,reject,abort}_prompt_and_data_filling(prompt, context, schema, template_uri)`。
   - 校验失败抛 `ContentValidationError(ErrorCatalog.X, facts=None, *, language=None, message=None, cause=None, errors=None, params=None)`；`.code_str` 取机器码（如 `llm.invocation_failed`、`template.not_found`），`.errors` 为 `list[SlotValidationError]`（`.slot_name/.code/.message`）。
   - 协商 propose 生成（确定性、零 LLM）：
     ```python
     from a2a_t.negotiation.content.models import InformationProposeContent, NegotiationItem, NegotiationProposeData
     mc = server.generate_negotiation_propose_prompt_from_data(
         NegotiationProposeData(context=context, content=InformationProposeContent(items=[...], relationship=None)),
         INFORMATION_NEGOTIATION_PROPOSE_URI)  # -> MetadataContent
     metadata = mc.build_metadata_content()  # {<Negotiation-T ext uri>: prompt_text, "templateUri": ..., "negotiationContext": {id, round, maxRounds, performative}}
     ```
   - `NegotiationContext(id, round, max_rounds, performative)`（frozen）；`.next_round()`、`.with_performative(...)`；`NegotiationPerformative ∈ {PROPOSE, ACCEPT, REJECT, ABORT}`。
   - slot schema 加载：`from a2a_t.common.prompt_resources.resource_access import PackagedPromptResourceAccess`；`PackagedPromptResourceAccess().slot_schema(template_uri, language) -> dict`。**schema 按 language 区分，zh-CN 模板的 slot 名是中文**（如 subscribe-incident 的 `通知主题`/`订阅条件`/`上报通知数据格式`，`required: []`）。
   - .env 配置键（SDK 的 llm/config_loader.py）：`A2AT_LLM_PROVIDER`（如 `openai`）、`A2AT_LLM_MODEL`、`A2AT_LLM_API_KEY`、`A2AT_LLM_BASE_URL`、`A2AT_LLM_MAX_ATTEMPTS`、`A2AT_LANGUAGE`。
   - 扩展 URI 常量（`a2a_t.core.metadata`）：`TASK_T_EXTENSION_URI`/`NOTIFICATION_T_EXTENSION_URI`/`AUTHORIZATION_T_EXTENSION_URI`/`NEGOTIATION_T_EXTENSION_URI`（tmforum.org 域名下 4 个 v1 URI）、`TEMPLATE_URI_METADATA_KEY="templateUri"`、`NEGOTIATION_CONTEXT_METADATA_KEY="negotiationContext"`。
   - 模板 URI 常量（`a2a_t.core.standard_templates`）：`PRIVATE_LINE_COMPLAINT_URI`、`ENERGY_SAVING_URI`、`SUBSCRIBE_INCIDENT_URI`、`SERVICE_RECOVERY_URI`、`AUTHORIZATION_POLICY_MANAGEMENT_URI`、`INFORMATION_NEGOTIATION_PROPOSE_URI` 等 12 个。
2. **官方 a2a-sdk（pin 1.1.0，import 名 `a2a`，protobuf 类型）**，样例验证过的装配模式（`a2a-t-sample/subscribe-incident/src/server_example/`）：
   ```python
   from a2a.server.agent_execution.agent_executor import AgentExecutor
   from a2a.server.agent_execution.context import RequestContext
   from a2a.server.events.event_queue import EventQueue
   from a2a.server.request_handlers import DefaultRequestHandler
   from a2a.server.routes import create_agent_card_routes, create_rest_routes
   from a2a.server.tasks.inmemory_task_store import InMemoryTaskStore
   from a2a.types import (AgentCard, Artifact, Message, Role, Task, TaskState, TaskStatus,
                          TaskStatusUpdateEvent, TaskArtifactUpdateEvent)
   routes = [*create_agent_card_routes(agent_card), *create_rest_routes(handler)]   # 卡片路由在前
   handler = DefaultRequestHandler(agent_executor=executor, task_store=InMemoryTaskStore(), agent_card=agent_card)
   ```
   - REST 端点：`POST /message:send`（非流式，返回最终 Task）、`POST /message:stream`（SSE）、卡片在 `GET /.well-known/agent-card.json`。
   - `TaskState` 枚举名：`TASK_STATE_SUBMITTED/WORKING/COMPLETED/FAILED/CANCELED/INPUT_REQUIRED/REJECTED/AUTH_REQUIRED`。
   - executor 模式：`execute(context, event_queue)` 中先 `event_queue.enqueue_event(Task(...))`（SUBMITTED），随后 `TaskStatusUpdateEvent`/`TaskArtifactUpdateEvent(last_chunk=True)`；**必须**推进 `context.current_task`（CopyFrom 后更新 id/context_id/status）。
   - metadata 读写：读用 `google.protobuf.json_format.MessageToDict(context.message.metadata)`；构造带 metadata 的消息/事件**统一用 `ParseDict(payload_dict, XxxType())`**（嵌套 dict 自动转 Value，避免 map 赋值语义差异）；请求侧客户端样例证明 `request.message.metadata[uri] = "text"` 字符串直赋可用。
   - AgentCard dict → `ParseDict(card_dict, AgentCard())`；`supportedInterfaces: [{"protocolBinding": "HTTP+JSON", "protocolVersion": "1.0.0", "url": ...}]`；扩展声明在 `capabilities.extensions: [{"uri": ..., "description": ...}]`。
   - `RequestContext`：`.message`、`.task_id`、`.context_id`、`.current_task`（可写）、`.requested_extensions`（1.1.0 在 `context.call_context.requested_extensions`，用 getattr 兜底取两者）。
3. **服务器不配 LLM 时的行为（本设计的明确决策）**：SDK 的 check/validate 内部含 LLM 步骤（场景识别/slot 抽取）。服务器 .env 配了 `A2AT_LLM_*` → 完整协议（含协商）；没配或 LLM 不可用（code 属于 `llm.not_configured/llm.invocation_failed/llm.response_invalid`）且 `OPENAN_DEBUG_STUB_FALLBACK=on` → **降级直接打桩**（跳过校验抽取，按 templateUri 路由变体返回），日志 `fallback_used=true`。因此**所有离线测试必须用 `A2ATClient.generate_task_prompt_from_data_with_schema` 生成真实 prompt**（确定性、零 LLM），不能用任意文本。
4. **与规格的一处澄清**：泛化打桩数据在本地生成后上传（服务器不调 LLM 做泛化）不变；但 Mock Agent 的 SDK 校验/抽取步骤需要服务器配置 LLM 端点才能启用协商分支——这是部署配置项（DashScope/DeepSeek 等 OpenAI 兼容端点均可），未配置时自动降级直接打桩，联调不中断。
5. **前端走 fetch 封装 + DEV 环境 mock 兜底**（frontend-mock-fallback 规范）：`api.js` 捕获网络错误返回内置 fixture，API 正常时直连。
6. 部署目标：root@47.120.10.111（密码见 openan-aliyun-deploy 技能），Nginx 已托管现有网站，只动 `/debug/` 前缀，不动 80 端口其他路径。

## 文件结构

```
openan-debug/
├── docs/superpowers/{specs,plans}/          # 已有 spec；本计划
├── server/
│   ├── pyproject.toml                       # uv 项目；a2a-t-sdk 用本地路径 editable
│   ├── requirements.txt                     # 服务器部署用 pinned 清单（a2a-t-sdk 走 wheel）
│   ├── .env.example                         # 本地/服务器 .env 模板
│   ├── openan_debug/
│   │   ├── __init__.py
│   │   ├── config.py                        # Settings + load_settings（dotenv）
│   │   ├── models.py                        # SQLAlchemy ORM：User/Agent/Seed/Variant/RequestLog
│   │   ├── db.py                            # engine/init_db/bootstrap admin+agent
│   │   ├── auth.py                          # pbkdf2 口令哈希 + JWT + FastAPI 依赖
│   │   ├── schemas.py                       # pydantic 请求模型
│   │   ├── deps.py                          # get_settings/get_engine 依赖
│   │   ├── stub_service.py                  # 变体轮询选取 + {{slots.x}}/{{timestamp}}/{{uuid}} 回填
│   │   ├── protocol_flow.py                 # 纯逻辑：校验→抽取→协商→打桩 FlowResult
│   │   ├── main.py                          # create_app：routers + /debug/a2a mount + lifespan
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── auth_router.py               # /api/v1/auth/*
│   │   │   ├── users_router.py              # /api/v1/users/*（admin）
│   │   │   ├── seeds_router.py              # /api/v1/seeds/*
│   │   │   ├── variants_router.py           # /api/v1/variants/*（含 import）
│   │   │   ├── console_router.py            # /api/v1/console/send
│   │   │   └── history_router.py            # /api/v1/history/*
│   │   └── agent/
│   │       ├── __init__.py
│   │       ├── agent_card.py                # AgentCard payload/build
│   │       ├── executor.py                  # MockAgentExecutor + 事件适配 + 日志 entry
│   │       ├── flow_env.py                  # A2ATServer 持有 + schema 缓存 + 轮询游标
│   │       └── a2a_app.py                   # Starlette 子应用 + A2A-Extensions 回显中间件
│   └── tests/
│       ├── conftest.py                      # settings/app/client/admin_token/seed_variant fixtures
│       ├── test_config_smoke.py             # SDK 导入与 slot_schema 冒烟
│       ├── test_models_db.py
│       ├── test_auth_api.py
│       ├── test_stub_service.py
│       ├── test_protocol_flow.py
│       ├── test_agent_app.py                # /message:send 降级全链路 + agent-card + header 回显
│       ├── test_seeds_api.py
│       ├── test_variants_api.py
│       ├── test_console_history_api.py
│       └── test_e2e_sample_client.py        # 真实 a2a ClientFactory + uvicorn 线程
├── frontend/
│   ├── package.json / vite.config.js / index.html
│   └── src/
│       ├── main.jsx / App.jsx / styles.css
│       ├── api.js / mock.js / templates.js
│       └── pages/{Login,Seeds,Console,History,Users}.jsx
├── tools/stub_generator/
│   ├── cli.py                               # 本地泛化 CLI（OpenAI 兼容）
│   └── test_stub_generator.py
├── deploy/
│   ├── openan-debug.service                 # systemd 单元
│   ├── nginx-locations.conf                 # /debug/ location 片段
│   ├── remote_nginx_insert.py               # 远端把片段插入现有 server 块（幂等）
│   ├── server.env.template                  # 服务器 .env 模板（含 A2AT_LLM_* 占位）
│   └── deploy.py                            # paramiko 打包上传 + 远端安装 + 启动 + 验证
└── README.md
```

---

### Task 1: 项目骨架、依赖与配置模块

**Files:**
- Create: `server/pyproject.toml`, `server/requirements.txt`, `server/.env.example`, `server/openan_debug/__init__.py`, `server/openan_debug/config.py`, `server/tests/test_config_smoke.py`

- [ ] **Step 1: 检查本机 uv 与 Python 3.12+**

Run: `uv --version; python --version`
Expected: uv 有版本号；Python >= 3.12。若 uv 缺失：`pip install uv`。

- [ ] **Step 2: 写 `server/pyproject.toml`**

```toml
[project]
name = "openan-debug-server"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "a2a-sdk==1.1.0",
    "fastapi>=0.115,<1",
    "uvicorn[standard]>=0.34,<1",
    "sqlalchemy>=2.0,<3",
    "pyjwt>=2.9,<3",
    "httpx>=0.28,<1",
    "python-dotenv>=1.1",
    "python-multipart>=0.0.9",
    "pydantic>=2.7,<3",
    "a2a-t-sdk",
]

[tool.uv.sources]
a2a-t-sdk = { path = "../../a2a-t-sdk-python", editable = true }

[dependency-groups]
dev = ["pytest>=8", "pytest-asyncio>=0.24"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

- [ ] **Step 3: 写 `server/.env.example`**

```ini
A2AT_LLM_PROVIDER=openai
A2AT_LLM_MODEL=qwen-plus
A2AT_LLM_API_KEY=sk-xxx
A2AT_LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
A2AT_LLM_MAX_ATTEMPTS=2
A2AT_LANGUAGE=zh-CN
OPENAN_DEBUG_HOST=127.0.0.1
OPENAN_DEBUG_PORT=9000
OPENAN_DEBUG_DB_PATH=data/openan-debug.db
OPENAN_DEBUG_JWT_SECRET=change-me-to-random
OPENAN_DEBUG_ADMIN_PASSWORD=
OPENAN_DEBUG_PUBLIC_URL=http://47.120.10.111/debug/a2a
OPENAN_DEBUG_AGENT_INTERNAL_URL=http://127.0.0.1:9000/debug/a2a/message:send
OPENAN_DEBUG_STUB_FALLBACK=on
```

- [ ] **Step 4: 写 `server/requirements.txt`**（服务器部署用，a2a-t-sdk 从 wheel 装）

```
a2a-sdk==1.1.0
fastapi>=0.115,<1
uvicorn[standard]>=0.34,<1
sqlalchemy>=2.0,<3
pyjwt>=2.9,<3
httpx>=0.28,<1
python-dotenv>=1.1
python-multipart>=0.0.9
pydantic>=2.7,<3
```

- [ ] **Step 5: 写 `server/openan_debug/__init__.py` 与 `config.py`**

`__init__.py` 内容：
```python
```
（空文件）

`config.py`：
```python
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


@dataclass(slots=True)
class Settings:
    host: str = "127.0.0.1"
    port: int = 9000
    db_path: Path = Path("data/openan-debug.db")
    jwt_secret: str = "dev-secret-change-me"
    jwt_expire_minutes: int = 720
    admin_password: str | None = None
    public_agent_url: str = "http://127.0.0.1:9000/debug/a2a"
    agent_internal_url: str = "http://127.0.0.1:9000/debug/a2a/message:send"
    stub_fallback: bool = True
    language: str = "zh-CN"
    env_path: Path = Path(".env")


def load_settings(env_path: Path | None = None) -> Settings:
    env_path = env_path or Path(os.environ.get("OPENAN_DEBUG_ENV", ".env"))
    if env_path.exists():
        load_dotenv(env_path, override=False)
    return Settings(
        host=os.environ.get("OPENAN_DEBUG_HOST", "127.0.0.1"),
        port=int(os.environ.get("OPENAN_DEBUG_PORT", "9000")),
        db_path=Path(os.environ.get("OPENAN_DEBUG_DB_PATH", "data/openan-debug.db")),
        jwt_secret=os.environ.get("OPENAN_DEBUG_JWT_SECRET", "dev-secret-change-me"),
        jwt_expire_minutes=int(os.environ.get("OPENAN_DEBUG_JWT_EXPIRE_MINUTES", "720")),
        admin_password=os.environ.get("OPENAN_DEBUG_ADMIN_PASSWORD") or None,
        public_agent_url=os.environ.get("OPENAN_DEBUG_PUBLIC_URL", "http://127.0.0.1:9000/debug/a2a"),
        agent_internal_url=os.environ.get(
            "OPENAN_DEBUG_AGENT_INTERNAL_URL", "http://127.0.0.1:9000/debug/a2a/message:send"
        ),
        stub_fallback=os.environ.get("OPENAN_DEBUG_STUB_FALLBACK", "on").lower() != "off",
        language=os.environ.get("A2AT_LANGUAGE", "zh-CN"),
        env_path=env_path,
    )
```

- [ ] **Step 6: 写失败测试 `server/tests/test_config_smoke.py`**

```python
from pathlib import Path

from a2a_t.common.prompt_resources.resource_access import PackagedPromptResourceAccess
from a2a_t.core.standard_templates import (
    INFORMATION_NEGOTIATION_PROPOSE_URI,
    SUBSCRIBE_INCIDENT_URI,
)

from openan_debug.config import Settings, load_settings


def test_load_settings_reads_env_file(tmp_path):
    env = tmp_path / ".env"
    env.write_text("OPENAN_DEBUG_PORT=9100\nOPENAN_DEBUG_STUB_FALLBACK=off\n", encoding="utf-8")
    settings = load_settings(env)
    assert settings.port == 9100
    assert settings.stub_fallback is False


def test_settings_defaults():
    settings = Settings()
    assert settings.port == 9000
    assert settings.stub_fallback is True


def test_packaged_slot_schema_resolves():
    schema = PackagedPromptResourceAccess().slot_schema(SUBSCRIBE_INCIDENT_URI, "zh-CN")
    assert schema["type"] == "object"
    assert "通知主题" in schema["properties"]
    schema2 = PackagedPromptResourceAccess().slot_schema(INFORMATION_NEGOTIATION_PROPOSE_URI, "zh-CN")
    assert isinstance(schema2, dict)
```

- [ ] **Step 7: 安装依赖并运行测试**

Run（workdir `server`）: `uv sync; uv run pytest tests/test_config_smoke.py -v`
Expected: 3 passed。若 `a2a-sdk==1.1.0` 拉取失败，改用 `a2a-sdk==1.1.2`（导入面一致，DefaultRequestHandler 为 V2 别名）并同步更新 requirements.txt。

- [ ] **Step 8: Commit**

```bash
git add server/pyproject.toml server/requirements.txt server/.env.example server/openan_debug server/tests
git commit -m "feat(server): project skeleton, deps, config module with SDK smoke test"
```

---

### Task 2: 数据库模型与初始化

**Files:**
- Create: `server/openan_debug/models.py`, `server/openan_debug/db.py`, `server/openan_debug/auth.py`（本任务只做口令哈希部分）, `server/tests/test_models_db.py`

- [ ] **Step 1: 写失败测试 `server/tests/test_models_db.py`**

```python
from sqlalchemy import select
from sqlalchemy.orm import Session

from openan_debug.auth import hash_password, verify_password
from openan_debug.config import Settings
from openan_debug.db import init_db, make_engine
from openan_debug.models import Agent, User


def test_password_hash_roundtrip():
    stored = hash_password("s3cret")
    assert stored != "s3cret"
    assert verify_password("s3cret", stored)
    assert not verify_password("wrong", stored)


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
```

- [ ] **Step 2: 运行确认失败**

Run（workdir `server`）: `uv run pytest tests/test_models_db.py -v`
Expected: FAIL（ModuleNotFoundError: openan_debug.models / auth / db）

- [ ] **Step 3: 写 `server/openan_debug/auth.py`（口令哈希部分，JWT 在 Task 3 追加）**

```python
import hashlib
import hmac
import os

_ITERATIONS = 240_000


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _ITERATIONS)
    return f"pbkdf2${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt_hex, digest_hex = stored.split("$")
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), _ITERATIONS)
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, AttributeError):
        return False
```

- [ ] **Step 4: 写 `server/openan_debug/models.py`**

```python
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    role: Mapped[str] = mapped_column(String(16), default="user")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Agent(Base):
    __tablename__ = "agents"
    id: Mapped[int] = mapped_column(primary_key=True)
    organization: Mapped[str] = mapped_column(String(128), default="OpenAN")
    name: Mapped[str] = mapped_column(String(128), default="OpenAN Debug Mock Agent")
    description: Mapped[str] = mapped_column(Text, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Seed(Base):
    __tablename__ = "seeds"
    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id"))
    template_uri: Mapped[str] = mapped_column(String(256), index=True)
    name: Mapped[str] = mapped_column(String(128))
    seed_json: Mapped[dict] = mapped_column(JSON)
    description: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Variant(Base):
    __tablename__ = "variants"
    id: Mapped[int] = mapped_column(primary_key=True)
    seed_id: Mapped[int | None] = mapped_column(ForeignKey("seeds.id"), nullable=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id"))
    template_uri: Mapped[str] = mapped_column(String(256), index=True)
    variant_json: Mapped[dict] = mapped_column(JSON)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    source: Mapped[str] = mapped_column(String(16), default="import")
    seq: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class RequestLog(Base):
    __tablename__ = "request_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int | None] = mapped_column(ForeignKey("agents.id"), nullable=True)
    template_uri: Mapped[str | None] = mapped_column(String(256), nullable=True, index=True)
    direction: Mapped[str] = mapped_column(String(16), default="inbound")
    request_body: Mapped[dict] = mapped_column(JSON, default=dict)
    response_body: Mapped[dict] = mapped_column(JSON, default=dict)
    task_state: Mapped[str | None] = mapped_column(String(32), nullable=True)
    negotiated: Mapped[bool] = mapped_column(Boolean, default=False)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
```

- [ ] **Step 5: 写 `server/openan_debug/db.py`**

```python
import secrets
import sys

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from .auth import hash_password
from .config import Settings
from .models import Agent, Base, User


def make_engine(settings: Settings):
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    return create_engine(
        f"sqlite:///{settings.db_path}", connect_args={"check_same_thread": False}
    )


def init_db(engine, settings: Settings) -> None:
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        if session.scalar(select(User).limit(1)) is None:
            password = settings.admin_password or secrets.token_urlsafe(12)
            session.add(User(username="admin", password_hash=hash_password(password), role="admin"))
            session.commit()
            print(f"[openan-debug] bootstrap admin user 'admin' password: {password}", file=sys.stderr)
        if session.scalar(select(Agent).limit(1)) is None:
            session.add(Agent())
            session.commit()
```

- [ ] **Step 6: 运行测试通过**

Run（workdir `server`）: `uv run pytest tests/test_models_db.py -v`
Expected: 2 passed

- [ ] **Step 7: Commit**

```bash
git add server/openan_debug server/tests/test_models_db.py
git commit -m "feat(server): SQLAlchemy models, db init with admin/agent bootstrap, pbkdf2 hashing"
```

---

### Task 3: 认证与用户管理 API

**Files:**
- Modify: `server/openan_debug/auth.py`（追加 JWT + FastAPI 依赖）
- Create: `server/openan_debug/deps.py`, `server/openan_debug/schemas.py`, `server/openan_debug/routers/__init__.py`, `server/openan_debug/routers/auth_router.py`, `server/openan_debug/routers/users_router.py`, `server/tests/test_auth_api.py`

- [ ] **Step 1: 写失败测试 `server/tests/test_auth_api.py`**

```python
from tests.conftest import auth_header


def test_login_success_and_me(client):
    resp = client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin-pass-01"})
    assert resp.status_code == 200
    token = resp.json()["token"]
    me = client.get("/api/v1/auth/me", headers=auth_header(token))
    assert me.status_code == 200
    assert me.json() == {"username": "admin", "role": "admin"}


def test_login_wrong_password(client):
    resp = client.post("/api/v1/auth/login", json={"username": "admin", "password": "nope"})
    assert resp.status_code == 401


def test_api_requires_token(client):
    assert client.get("/api/v1/users").status_code == 401
    assert client.get("/api/v1/auth/me", headers={"Authorization": "Bearer bad"}).status_code == 401


def test_admin_creates_and_disables_user(client, admin_token):
    headers = auth_header(admin_token)
    resp = client.post(
        "/api/v1/users",
        json={"username": "tester", "password": "test-pass-01", "role": "user"},
        headers=headers,
    )
    assert resp.status_code == 201
    user_id = resp.json()["id"]
    users = client.get("/api/v1/users", headers=headers).json()
    assert any(u["username"] == "tester" for u in users)
    resp = client.patch(f"/api/v1/users/{user_id}", json={"enabled": False}, headers=headers)
    assert resp.status_code == 200
    login = client.post("/api/v1/auth/login", json={"username": "tester", "password": "test-pass-01"})
    assert login.status_code == 401


def test_non_admin_forbidden(client, admin_token):
    headers = auth_header(admin_token)
    client.post("/api/v1/users", json={"username": "u2", "password": "p2w123456", "role": "user"}, headers=headers)
    token = client.post("/api/v1/auth/login", json={"username": "u2", "password": "p2w123456"}).json()["token"]
    assert client.get("/api/v1/users", headers=auth_header(token)).status_code == 403
```

- [ ] **Step 2: 写 `server/tests/conftest.py`**

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from openan_debug.config import Settings
from openan_debug.db import init_db, make_engine
from openan_debug.main import create_app
from openan_debug.models import Variant

TEST_ENV = """A2AT_LLM_PROVIDER=openai
A2AT_LLM_MODEL=dummy
A2AT_LLM_API_KEY=dummy
A2AT_LLM_BASE_URL=http://127.0.0.1:9
A2AT_LLM_MAX_ATTEMPTS=1
A2AT_LANGUAGE=zh-CN
"""

SUBSCRIBE_INCIDENT_URI = "Notification-T/network-layer/subscribe-incident/v1"

VARIANT_STUB = {
    "faultManagement.Incident": {
        "csn": "INC-{{timestamp}}",
        "name": "ETH-LOS",
        "priority": "critical",
        "status": "open",
        "topic": "{{slots.通知主题}}",
    }
}


@pytest.fixture()
def settings(tmp_path):
    env_path = tmp_path / ".env"
    env_path.write_text(TEST_ENV, encoding="utf-8")
    return Settings(
        db_path=tmp_path / "test.db",
        jwt_secret="test-secret",
        admin_password="admin-pass-01",
        language="zh-CN",
        env_path=env_path,
    )


@pytest.fixture()
def app(settings):
    return create_app(settings)


@pytest.fixture()
def client(app):
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def admin_token(client):
    resp = client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin-pass-01"})
    assert resp.status_code == 200
    return resp.json()["token"]


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def seed_variant(client, admin_token):
    headers = auth_header(admin_token)
    resp = client.post(
        "/api/v1/seeds",
        json={
            "name": "订阅事件样本",
            "templateUri": SUBSCRIBE_INCIDENT_URI,
            "seedJson": {"faultManagement.Incident": {"csn": "INC-001", "priority": "critical"}},
            "description": "smoke",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    seed_id = resp.json()["id"]
    resp = client.post(
        "/api/v1/variants/import",
        json={"seedId": seed_id, "templateUri": SUBSCRIBE_INCIDENT_URI, "variants": [VARIANT_STUB]},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    with Session(client.app.state.engine) as session:
        agent_id = session.scalar(select(Variant.agent_id).limit(1))
    return {"seedId": seed_id, "agentId": agent_id, "templateUri": SUBSCRIBE_INCIDENT_URI}
```

- [ ] **Step 3: 在 `auth.py` 追加 JWT 与依赖（文件末尾追加）**

```python
import time

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

_bearer = HTTPBearer(auto_error=False)


def create_token(username: str, role: str, secret: str, expire_minutes: int) -> str:
    payload = {"sub": username, "role": role, "exp": int(time.time()) + expire_minutes * 60}
    return jwt.encode(payload, secret, algorithm="HS256")


def get_current_user(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, request.app.state.settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return {"username": payload["sub"], "role": payload["role"]}


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin required")
    return user
```

- [ ] **Step 4: 写 `deps.py` 与 `schemas.py`**

`deps.py`：
```python
from fastapi import Request
from sqlalchemy.orm import Session

from .config import Settings


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_db(request: Request):
    engine = request.app.state.engine
    with Session(engine) as session:
        yield session
```

`schemas.py`：
```python
from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=8)
    role: str = Field(default="user", pattern="^(admin|user)$")


class UserPatch(BaseModel):
    enabled: bool | None = None
    role: str | None = Field(default=None, pattern="^(admin|user)$")
    password: str | None = Field(default=None, min_length=8)


class SeedCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    templateUri: str = Field(min_length=1, max_length=256)
    seedJson: dict
    description: str = ""


class SeedPatch(BaseModel):
    name: str | None = None
    templateUri: str | None = None
    seedJson: dict | None = None
    description: str | None = None


class VariantImportRequest(BaseModel):
    seedId: int | None = None
    templateUri: str = Field(min_length=1, max_length=256)
    variants: list[dict]


class VariantPatch(BaseModel):
    enabled: bool | None = None
    variantJson: dict | None = None
```

- [ ] **Step 5: 写 `routers/__init__.py`（空）与 `auth_router.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import create_token, get_current_user, verify_password
from ..deps import get_db, get_settings
from ..models import User
from ..schemas import LoginRequest

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login")
def login(body: LoginRequest, db: Session = Depends(get_db), settings=Depends(get_settings)):
    user = db.scalar(select(User).where(User.username == body.username))
    if user is None or not user.enabled or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token(user.username, user.role, settings.jwt_secret, settings.jwt_expire_minutes)
    return {"token": token, "username": user.username, "role": user.role}


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return user
```

- [ ] **Step 6: 写 `users_router.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_current_user, hash_password, require_admin
from ..deps import get_db
from ..models import User
from ..schemas import UserCreate, UserPatch

router = APIRouter(prefix="/api/v1/users", tags=["users"])


def _user_view(user: User) -> dict:
    return {"id": user.id, "username": user.username, "role": user.role, "enabled": user.enabled}


@router.get("")
def list_users(db: Session = Depends(get_db), _: dict = Depends(require_admin)):
    return [_user_view(u) for u in db.scalars(select(User).order_by(User.id)).all()]


@router.post("", status_code=201)
def create_user(body: UserCreate, db: Session = Depends(get_db), _: dict = Depends(require_admin)):
    if db.scalar(select(User).where(User.username == body.username)) is not None:
        raise HTTPException(status_code=409, detail="Username exists")
    user = User(username=body.username, password_hash=hash_password(body.password), role=body.role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return _user_view(user)


@router.patch("/{user_id}")
def patch_user(user_id: int, body: UserPatch, db: Session = Depends(get_db), _: dict = Depends(require_admin)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if body.enabled is not None:
        user.enabled = body.enabled
    if body.role is not None:
        user.role = body.role
    if body.password is not None:
        user.password_hash = hash_password(body.password)
    db.commit()
    return _user_view(user)
```

- [ ] **Step 7: 写最小 `main.py`（本任务只挂 auth/users 路由与 lifespan，后续任务扩充）**

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .config import Settings, load_settings
from .db import init_db, make_engine
from .routers.auth_router import router as auth_router
from .routers.users_router import router as users_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings: Settings = app.state.settings
    app.state.engine = make_engine(settings)
    init_db(app.state.engine, settings)
    yield
    app.state.engine.dispose()


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    app = FastAPI(title="OpenAN-Debug", lifespan=lifespan)
    app.state.settings = settings
    app.include_router(auth_router)
    app.include_router(users_router)

    @app.get("/api/v1/health")
    async def health():
        return {"status": "ok"}

    return app
```

- [ ] **Step 8: 运行测试通过**

Run（workdir `server`）: `uv run pytest tests/test_auth_api.py tests/test_models_db.py -v`
Expected: 全部 passed

- [ ] **Step 9: Commit**

```bash
git add server/openan_debug server/tests
git commit -m "feat(server): JWT auth, user management API, app factory with lifespan"
```

---

### Task 4: 打桩数据服务（变体轮询 + 占位符回填）

**Files:**
- Create: `server/openan_debug/stub_service.py`, `server/tests/test_stub_service.py`

- [ ] **Step 1: 写失败测试 `server/tests/test_stub_service.py`**

```python
from sqlalchemy.orm import Session

from openan_debug.models import Agent, Variant
from openan_debug.stub_service import fill_placeholders, pick_variant


def _add_variant(session, agent_id, template_uri, seq, data, enabled=True):
    session.add(Variant(agent_id=agent_id, template_uri=template_uri, variant_json=data, seq=seq, enabled=enabled))
    session.commit()


def test_pick_variant_round_robin(engine):
    with Session(engine) as session:
        agent = session.scalars(session.query(Agent)).first()
        uri = "Task-T/network-layer/private-line-complaint/v1"
        _add_variant(session, agent.id, uri, 0, {"n": "a"})
        _add_variant(session, agent.id, uri, 1, {"n": "b"})
        cursor = {}
        picked = [pick_variant(session, agent.id, uri, cursor).variant_json["n"] for _ in range(4)]
        assert picked == ["a", "b", "a", "b"]


def test_pick_variant_skips_disabled_and_missing(engine):
    with Session(engine) as session:
        agent = session.scalars(session.query(Agent)).first()
        _add_variant(session, agent.id, "Task-T/x/v9", 0, {"n": "on"}, enabled=True)
        _add_variant(session, agent.id, "Task-T/x/v9", 1, {"n": "off"}, enabled=False)
        assert pick_variant(session, agent.id, "Task-T/x/v9", {}).variant_json == {"n": "on"}
        assert pick_variant(session, agent.id, "Task-T/none/v1", {}) is None


def test_fill_placeholders():
    params = {"通知主题": "Incident", "level": 3}
    data = {
        "csn": "INC-{{timestamp}}",
        "topic": "{{slots.通知主题}}",
        "level": "{{slots.level}}",
        "missing": "{{slots.nope}}",
        "nested": {"reqId": "{{uuid}}", "list": ["{{slots.通知主题}}"]},
        "num": 7,
    }
    filled = fill_placeholders(data, params)
    assert filled["topic"] == "Incident"
    assert filled["level"] == "3"
    assert filled["missing"] == ""
    assert "{{" not in filled["csn"] and "T" in filled["csn"]
    assert len(filled["nested"]["reqId"]) == 36
    assert filled["nested"]["list"] == ["Incident"]
    assert filled["num"] == 7
```

注意：测试里用了 `engine` fixture，把它追加到 `conftest.py`：

```python
@pytest.fixture()
def engine(app):
    return app.state.engine
```

- [ ] **Step 2: 运行确认失败**

Run（workdir `server`）: `uv run pytest tests/test_stub_service.py -v`
Expected: FAIL（No module named openan_debug.stub_service）

- [ ] **Step 3: 写 `server/openan_debug/stub_service.py`**

```python
import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Variant

_SLOTS = re.compile(r"\{\{slots\.([A-Za-z0-9_.\-一-龥]+)\}\}")
_TIMESTAMP = "{{timestamp}}"
_UUID = "{{uuid}}"


def pick_variant(session: Session, agent_id: int, template_uri: str, cursor: dict) -> Variant | None:
    variants = session.scalars(
        select(Variant)
        .where(Variant.agent_id == agent_id, Variant.template_uri == template_uri, Variant.enabled == True)  # noqa: E712
        .order_by(Variant.seq, Variant.id)
    ).all()
    if not variants:
        return None
    key = (agent_id, template_uri)
    index = cursor.get(key, 0) % len(variants)
    cursor[key] = index + 1
    return variants[index]


def fill_placeholders(value, params: dict):
    if isinstance(value, str):
        value = _SLOTS.sub(lambda m: str(params.get(m.group(1), "")), value)
        if _TIMESTAMP in value:
            value = value.replace(_TIMESTAMP, datetime.now(timezone.utc).isoformat(timespec="milliseconds"))
        if _UUID in value:
            value = value.replace(_UUID, str(uuid.uuid4()))
        return value
    if isinstance(value, list):
        return [fill_placeholders(item, params) for item in value]
    if isinstance(value, dict):
        return {key: fill_placeholders(item, params) for key, item in value.items()}
    return value
```

- [ ] **Step 4: 运行测试通过**

Run（workdir `server`）: `uv run pytest tests/test_stub_service.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add server/openan_debug/stub_service.py server/tests/test_stub_service.py server/tests/conftest.py
git commit -m "feat(server): stub variant round-robin selection and placeholder filling"
```

---

### Task 5: 协议流程核心（纯逻辑）

**Files:**
- Create: `server/openan_debug/protocol_flow.py`, `server/tests/test_protocol_flow.py`

- [ ] **Step 1: 写失败测试 `server/tests/test_protocol_flow.py`**

```python
import pytest
from a2a_t.core.errors.catalog import ErrorCatalog
from a2a_t.core.errors.exceptions import A2ATError, ContentValidationError
from a2a_t.core.metadata import (
    NEGOTIATION_T_EXTENSION_URI,
    NegotiationContext,
    NegotiationPerformative,
)
from a2a_t.core.validation_pipeline import FilledParamData
from a2a_t.negotiation.content.enums import NegotiationConclusion
from a2a_t.negotiation.content.models import InformationEndingContent, NegotiationEndingData
from a2a_t.server.a2at_server import A2ATServer
from a2a_t.server.prompt_compliance.models import PromptComplianceFailure, PromptComplianceResult

from openan_debug.protocol_flow import FlowRequest, run_flow

TASK_URI = "Task-T/network-layer/private-line-complaint/v1"
NOTIF_URI = "Notification-T/network-layer/subscribe-incident/v1"
STUB = {"result": {"code": "{{slots.告警级别}}", "id": "R-1"}}


class FakeFlowEnv:
    language = "zh-CN"
    cursor = {}

    def schema_for(self, template_uri):
        return {"type": "object", "properties": {}}


class FakeServer:
    def __init__(self, *, compliance=None, params=None, validation_error=None):
        self._compliance = compliance
        self._params = params
        self._validation_error = validation_error
        self.propose_calls = []

    def check_task_prompt(self, *, processed_prompt_text):
        if isinstance(self._compliance, Exception):
            raise self._compliance
        return self._compliance

    def validate_task_prompt_and_data_filling(self, prompt, schema, template_uri):
        if self._validation_error is not None:
            raise self._validation_error
        return self._params

    def generate_negotiation_propose_prompt_from_data(self, data, template_uri):
        self.propose_calls.append((data, template_uri))
        metadata = data.content and None
        from a2a_t.core.metadata import MetadataContent

        return MetadataContent(
            template_uri=template_uri,
            prompt_text="propose-prompt",
            extension_uri=NEGOTIATION_T_EXTENSION_URI,
            negotiation_context=data.context,
        )


def _req(uri=TASK_URI, ctx=None):
    return FlowRequest(template_uri=uri, prompt_text="prompt", negotiation_context=ctx, requested_extensions=set())


def _ok_params(data=None):
    return FilledParamData(data=data if data is not None else {"告警级别": "critical", "round": 2, "id": "x", "maxRounds": 5}, context=None)


def _stub_fn(uri):
    return STUB


def test_missing_metadata_rejected():
    result = run_flow(FakeServer(compliance=PromptComplianceResult(success=True)), FakeFlowEnv(),
                      FlowRequest(template_uri=None, prompt_text="", negotiation_context=None, requested_extensions=set()),
                      _stub_fn)
    assert result.state == "REJECTED"


def test_compliance_failure_rejected():
    server = FakeServer(compliance=PromptComplianceResult(
        success=False,
        failure=PromptComplianceFailure(code="slot.not_provided", message="missing", stage="semantic_validation")))
    result = run_flow(server, FakeFlowEnv(), _req(uri=NOTIF_URI), _stub_fn)
    assert result.state == "REJECTED"
    assert "slot.not_provided" in result.message_text


def test_llm_failure_falls_back_to_stub():
    server = FakeServer(compliance=A2ATError("llm down", code=ErrorCatalog.LLM_INVOCATION_FAILED))
    result = run_flow(server, FakeFlowEnv(), _req(uri=NOTIF_URI), _stub_fn, fallback_enabled=True)
    assert result.state == "COMPLETED"
    assert result.fallback_used is True
    assert result.artifact_data == STUB


def test_llm_failure_without_fallback_rejected():
    server = FakeServer(compliance=A2ATError("llm down", code=ErrorCatalog.LLM_INVOCATION_FAILED))
    result = run_flow(server, FakeFlowEnv(), _req(uri=NOTIF_URI), _stub_fn, fallback_enabled=False)
    assert result.state == "REJECTED"


def test_params_complete_returns_artifact_with_placeholders():
    server = FakeServer(compliance=PromptComplianceResult(success=True), params=_ok_params())
    result = run_flow(server, FakeFlowEnv(), _req(), _stub_fn)
    assert result.state == "COMPLETED"
    assert result.artifact_data["result"]["code"] == "critical"


def test_missing_params_triggers_propose_input_required():
    server = FakeServer(compliance=PromptComplianceResult(success=True),
                        params=FilledParamData(data={"告警级别": None, "round": 2, "id": "x", "maxRounds": 5}, context=None))
    result = run_flow(server, FakeFlowEnv(), _req(), _stub_fn)
    assert result.state == "INPUT_REQUIRED"
    assert result.negotiated is True
    metadata = result.reply_metadata
    assert metadata["templateUri"] == "Negotiation-T/information-negotiation/propose/v1"
    context = metadata["negotiationContext"]
    assert context["round"] == 3 and context["performative"] == "PROPOSE"
    data, template_uri = server.propose_calls[0]
    assert [item.name for item in data.content.items] == ["告警级别"]


def test_validation_slot_errors_trigger_propose():
    error = ContentValidationError(
        ErrorCatalog.SLOT_NOT_PROVIDED,
        errors=[type("S", (), {"slot_name": "订阅条件", "code": "slot.not_provided", "message": "m"})()],
    )
    server = FakeServer(compliance=PromptComplianceResult(success=True), validation_error=error)
    result = run_flow(server, FakeFlowEnv(), _req(uri=NOTIF_URI), _stub_fn)
    assert result.state == "INPUT_REQUIRED"
    assert result.reply_metadata["negotiationContext"]["round"] == 2


def test_reject_and_abort_terminate():
    for performative, expected in (("REJECT", "CANCELED"), ("ABORT", "CANCELED")):
        ctx = {"id": "n1", "round": 1, "maxRounds": 5, "performative": performative}
        result = run_flow(FakeServer(compliance=PromptComplianceResult(success=True)), FakeFlowEnv(), _req(ctx=ctx), _stub_fn)
        assert result.state == expected
        assert result.negotiated is True


def test_rounds_exhausted_fails():
    ctx = {"id": "n1", "round": 5, "maxRounds": 5, "performative": "PROPOSE"}
    server = FakeServer(compliance=PromptComplianceResult(success=True),
                        params=FilledParamData(data={"告警级别": None}, context=None))
    result = run_flow(server, FakeFlowEnv(), _req(ctx=ctx), _stub_fn)
    assert result.state == "FAILED"


def test_no_variant_configured_fails():
    server = FakeServer(compliance=PromptComplianceResult(success=True), params=_ok_params({"告警级别": "low"}))
    result = run_flow(server, FakeFlowEnv(), _req(), lambda uri: None)
    assert result.state == "FAILED"
    assert "variant" in result.message_text


def test_real_server_propose_generation_smoke(settings):
    env_holder = {}
    env_holder["server"] = A2ATServer(env_path=settings.env_path)
    server = env_holder["server"]
    context = NegotiationContext(id="ctx-1", round=1, max_rounds=5, performative=NegotiationPerformative.PROPOSE)
    content = InformationEndingContent(conclusion=NegotiationConclusion.ACCEPT, items=[])
    metadata = server.generate_negotiation_accept_prompt_from_data(
        NegotiationEndingData(context=context, content=content), "Negotiation-T/information-negotiation/accept-reject/v1"
    )
    built = metadata.build_metadata_content()
    assert built["templateUri"] == "Negotiation-T/information-negotiation/accept-reject/v1"
```

- [ ] **Step 2: 运行确认失败**

Run（workdir `server`）: `uv run pytest tests/test_protocol_flow.py -v`
Expected: FAIL（No module named openan_debug.protocol_flow）

- [ ] **Step 3: 写 `server/openan_debug/protocol_flow.py`**

```python
import uuid
from dataclasses import dataclass, field

from a2a_t.core.errors.exceptions import A2ATError, ContentValidationError
from a2a_t.core.metadata import (
    NegotiationContext,
    NegotiationPerformative,
)
from a2a_t.core.standard_templates import INFORMATION_NEGOTIATION_PROPOSE_URI
from a2a_t.negotiation.content.models import (
    InformationProposeContent,
    NegotiationItem,
    NegotiationProposeData,
)

from .stub_service import fill_placeholders

CONTEXT_PARAM_KEYS = ("id", "round", "maxRounds")
LLM_FALLBACK_CODES = ("llm.not_configured", "llm.invocation_failed", "llm.response_invalid")


@dataclass(slots=True)
class FlowRequest:
    template_uri: str | None
    prompt_text: str
    negotiation_context: dict | None
    requested_extensions: set[str] = field(default_factory=set)


@dataclass(slots=True)
class FlowResult:
    state: str
    message_text: str
    reply_metadata: dict
    artifact_data: dict | None
    negotiated: bool
    fallback_used: bool = False


def family_prefix(template_uri: str | None) -> str | None:
    return template_uri.split("/", 1)[0] if template_uri else None


def detect_missing(params_data) -> list[str]:
    if not isinstance(params_data, dict):
        return []
    return [
        key
        for key, value in params_data.items()
        if key not in CONTEXT_PARAM_KEYS and (value is None or (isinstance(value, str) and not value.strip()))
    ]


def missing_items_from_errors(errors) -> list[str]:
    names = []
    for error in errors or []:
        slot_name = getattr(error, "slot_name", None)
        if isinstance(slot_name, str) and slot_name.strip() and slot_name not in names:
            names.append(slot_name)
    return names


def _stub_result(template_uri: str, stub_fn, negotiated: bool, fallback: bool) -> FlowResult:
    stub = stub_fn(template_uri)
    if stub is None:
        return FlowResult(
            state="FAILED",
            message_text=f"no enabled stub variant configured for template {template_uri}",
            reply_metadata={},
            artifact_data=None,
            negotiated=negotiated,
        )
    note = "stub data returned (LLM-less fallback mode)" if fallback else "stub data returned"
    return FlowResult(
        state="COMPLETED",
        message_text=note,
        reply_metadata={},
        artifact_data=fill_placeholders(stub, {}),
        negotiated=negotiated,
        fallback_used=fallback,
    )


def _validate(server, template_uri: str, prompt: str, schema):
    prefix = family_prefix(template_uri)
    if prefix == "Notification-T":
        return server.validate_notification_prompt_and_data_filling(prompt, schema, template_uri)
    if prefix == "Authorization-T":
        return server.validate_auth_prompt_and_data_filling(prompt, schema, template_uri)
    if prefix == "Negotiation-T":
        return server.validate_propose_prompt_and_data_filling(prompt, None, schema, template_uri)
    return server.validate_task_prompt_and_data_filling(prompt, schema, template_uri)


def _propose(server, missing: list[str], carried: dict | None) -> FlowResult:
    if carried:
        base_round = int(carried.get("round", 1))
        max_rounds = int(carried.get("maxRounds", NegotiationContext.DEFAULT_MAX_ROUNDS))
        context = NegotiationContext(
            id=str(carried.get("id") or uuid.uuid4()),
            round=base_round,
            max_rounds=max_rounds,
            performative=NegotiationPerformative.PROPOSE,
        ).next_round()
        negotiated = True
    else:
        context = NegotiationContext(
            id=str(uuid.uuid4()),
            round=1,
            max_rounds=NegotiationContext.DEFAULT_MAX_ROUNDS,
            performative=NegotiationPerformative.PROPOSE,
        )
        negotiated = False
    if context.round > context.max_rounds:
        return FlowResult(
            state="FAILED",
            message_text=f"negotiation rounds exhausted (round {context.round}/{context.max_rounds})",
            reply_metadata={},
            artifact_data=None,
            negotiated=True,
        )
    items = [NegotiationItem(name=name, value=None) for name in missing]
    metadata_content = server.generate_negotiation_propose_prompt_from_data(
        NegotiationProposeData(context=context, content=InformationProposeContent(items=items, relationship=None)),
        INFORMATION_NEGOTIATION_PROPOSE_URI,
    )
    return FlowResult(
        state="INPUT_REQUIRED",
        message_text="missing required parameters, negotiation propose issued",
        reply_metadata=metadata_content.build_metadata_content(),
        artifact_data=None,
        negotiated=True,
    )


def run_flow(server, flow_env, request: FlowRequest, stub_fn, fallback_enabled: bool = True) -> FlowResult:
    template_uri = request.template_uri
    prompt_text = request.prompt_text
    if not template_uri or not prompt_text:
        return FlowResult(
            state="REJECTED",
            message_text="missing A2A-T metadata (templateUri or extension prompt text)",
            reply_metadata={},
            artifact_data=None,
            negotiated=False,
        )
    carried = request.negotiation_context
    if carried:
        performative = str(carried.get("performative", "")).upper()
        if performative in ("REJECT", "ABORT"):
            text = "client rejected the negotiation" if performative == "REJECT" else "client aborted the negotiation"
            return FlowResult(
                state="CANCELED", message_text=text, reply_metadata={}, artifact_data=None, negotiated=True
            )

    def _fallback() -> FlowResult | None:
        if fallback_enabled:
            return _stub_result(template_uri, stub_fn, negotiated=bool(carried), fallback=True)
        return None

    schema = flow_env.schema_for(template_uri)
    params = None
    missing: list[str] = []
    if schema is not None:
        try:
            compliance = server.check_task_prompt(processed_prompt_text=prompt_text)
            failure = getattr(compliance, "failure", None)
            if not compliance.success and failure is not None:
                code = str(getattr(failure, "code", ""))
                if code in LLM_FALLBACK_CODES:
                    fallback_result = _fallback()
                    if fallback_result is not None:
                        return fallback_result
                return FlowResult(
                    state="REJECTED",
                    message_text=f"prompt compliance failed: {code}: {getattr(failure, 'message', '')}",
                    reply_metadata={},
                    artifact_data=None,
                    negotiated=False,
                )
        except A2ATError as error:
            if str(error.code_str) in LLM_FALLBACK_CODES:
                fallback_result = _fallback()
                if fallback_result is not None:
                    return fallback_result
            return FlowResult(
                state="REJECTED",
                message_text=f"prompt check error: {getattr(error, 'code_str', 'unknown')}: {error}",
                reply_metadata={},
                artifact_data=None,
                negotiated=False,
            )
        try:
            params = _validate(server, template_uri, prompt_text, schema)
            missing = detect_missing(getattr(params, "data", None))
        except ContentValidationError as error:
            if str(error.code_str) in LLM_FALLBACK_CODES:
                fallback_result = _fallback()
                if fallback_result is not None:
                    return fallback_result
            slot_names = missing_items_from_errors(getattr(error, "errors", None))
            if not slot_names:
                return FlowResult(
                    state="REJECTED",
                    message_text=f"validation failed: {error.code_str}: {error}",
                    reply_metadata={},
                    artifact_data=None,
                    negotiated=False,
                )
            missing = slot_names
        if missing:
            return _propose(server, missing, carried)

    if params is None:
        return _stub_result(template_uri, stub_fn, negotiated=bool(carried), fallback=True)
    params_map = {key: value for key, value in dict(params.data).items() if key not in CONTEXT_PARAM_KEYS}
    stub = stub_fn(template_uri)
    if stub is None:
        return FlowResult(
            state="FAILED",
            message_text=f"no enabled stub variant configured for template {template_uri}",
            reply_metadata={},
            artifact_data=None,
            negotiated=bool(carried),
        )
    return FlowResult(
        state="COMPLETED",
        message_text="stub data returned",
        reply_metadata={},
        artifact_data=fill_placeholders(stub, params_map),
        negotiated=bool(carried),
        fallback_used=False,
    )
```

- [ ] **Step 4: 运行测试通过**

Run（workdir `server`）: `uv run pytest tests/test_protocol_flow.py -v`
Expected: 11 passed。若 `test_rounds_exhausted_fails` 失败：核对 `NegotiationContext.next_round()` 语义（round+1），round 5→6 > max 5 应 FAIL。

- [ ] **Step 5: Commit**

```bash
git add server/openan_debug/protocol_flow.py server/tests/test_protocol_flow.py
git commit -m "feat(server): protocol flow core - compliance, extraction, negotiation, stub routing"
```

---

### Task 6: Mock Agent 装配（AgentCard、Executor、A2A 子应用、main.py 挂载、日志落库）

**Files:**
- Create: `server/openan_debug/agent/__init__.py`, `server/openan_debug/agent/agent_card.py`, `server/openan_debug/agent/flow_env.py`, `server/openan_debug/agent/executor.py`, `server/openan_debug/agent/a2a_app.py`
- Modify: `server/openan_debug/main.py`
- Create: `server/tests/test_agent_app.py`

- [ ] **Step 1: 写失败测试 `server/tests/test_agent_app.py`**

```python
import uuid

import pytest
from a2a_t.client.a2at_client import A2ATClient
from a2a_t.common.prompt_resources.resource_access import PackagedPromptResourceAccess
from a2a_t.core.metadata import NOTIFICATION_T_EXTENSION_URI
from a2a_t.core.standard_templates import SUBSCRIBE_INCIDENT_URI
from google.protobuf.json_format import ParseDict

from tests.conftest import SUBSCRIBE_INCIDENT_URI as SEED_URI
from tests.conftest import auth_header


@pytest.fixture()
def prompt_text(settings):
    client = A2ATClient(env_path=settings.env_path)
    schema = PackagedPromptResourceAccess().slot_schema(SUBSCRIBE_INCIDENT_URI, "zh-CN")
    data = {"通知主题": "Incident", "订阅条件": "故障优先级为：严重、高。故障名称为：光纤中断。", "上报通知数据格式": "通过DataPart上报Incident数据。"}
    metadata_content = client.generate_task_prompt_from_data_with_schema(data, schema, SUBSCRIBE_INCIDENT_URI)
    return metadata_content.build_metadata_content()


def _send_body(metadata: dict) -> dict:
    return {
        "message": {
            "messageId": str(uuid.uuid4()),
            "role": "ROLE_USER",
            "parts": [{"text": "subscribe incident"}],
            "metadata": metadata,
        }
    }


def test_agent_card_endpoint(client):
    resp = client.get("/debug/a2a/.well-known/agent-card.json")
    assert resp.status_code == 200
    card = resp.json()
    assert card["name"] == "OpenAN Debug Mock Agent"
    bindings = card["supportedInterfaces"]
    assert bindings[0]["protocolBinding"] == "HTTP+JSON"
    extension_uris = [ext["uri"] for ext in card["capabilities"]["extensions"]]
    assert NOTIFICATION_T_EXTENSION_URI in extension_uris


def test_send_message_fallback_returns_stub_artifact(client, seed_variant, prompt_text):
    body = _send_body(prompt_text)
    headers = {"A2A-Version": "1.0", "A2A-Extensions": NOTIFICATION_T_EXTENSION_URI}
    resp = client.post("/debug/a2a/message:send", json=body, headers=headers)
    assert resp.status_code == 200, resp.text
    text = resp.text
    assert "TASK_STATE_COMPLETED" in text or "COMPLETED" in text
    assert "faultManagement.Incident" in text
    assert "ETH-LOS" in text


def test_send_message_response_echoes_extensions(client, seed_variant, prompt_text):
    body = _send_body(prompt_text)
    headers = {"A2A-Version": "1.0", "A2A-Extensions": NOTIFICATION_T_EXTENSION_URI}
    resp = client.post("/debug/a2a/message:send", json=body, headers=headers)
    assert resp.status_code == 200
    assert resp.headers.get("a2a-extensions") == NOTIFICATION_T_EXTENSION_URI


def test_send_message_without_variant_fails(client, prompt_text):
    body = _send_body(prompt_text)
    headers = {"A2A-Version": "1.0", "A2A-Extensions": NOTIFICATION_T_EXTENSION_URI}
    resp = client.post("/debug/a2a/message:send", json=body, headers=headers)
    assert resp.status_code == 200
    assert "FAILED" in resp.text or "variant" in resp.text


def test_send_message_logs_history(client, seed_variant, prompt_text):
    body = _send_body(prompt_text)
    headers = {"A2A-Version": "1.0", "A2A-Extensions": NOTIFICATION_T_EXTENSION_URI}
    client.post("/debug/a2a/message:send", json=body, headers=headers)
    token = client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin-pass-01"}).json()["token"]
    history = client.get("/api/v1/history", headers=auth_header(token)).json()
    assert history["total"] >= 1
    item = history["items"][0]
    assert item["direction"] == "inbound"
    assert item["templateUri"] == SUBSCRIBE_INCIDENT_URI
```

- [ ] **Step 2: 运行确认失败**

Run（workdir `server`）: `uv run pytest tests/test_agent_app.py -v`
Expected: FAIL（No module named openan_debug.agent）

- [ ] **Step 3: 写 `server/openan_debug/agent/agent_card.py`**

```python
from google.protobuf.json_format import ParseDict

from a2a_t.core.metadata import (
    AUTHORIZATION_T_EXTENSION_URI,
    NEGOTIATION_T_EXTENSION_URI,
    NOTIFICATION_T_EXTENSION_URI,
    TASK_T_EXTENSION_URI,
)


def build_agent_card_payload(public_url: str) -> dict:
    return {
        "name": "OpenAN Debug Mock Agent",
        "description": "OpenAN-Debug mock agent returning stub data for A2A-T integration testing",
        "version": "1.0.0",
        "defaultInputModes": ["application/json", "text/plain"],
        "defaultOutputModes": ["application/json", "text/plain"],
        "provider": {"organization": "OpenAN", "url": "https://github.com/project-openan"},
        "skills": [
            {
                "id": "stub-responder",
                "name": "Stub responder",
                "description": "Returns stubbed business data for configured A2A-T templates",
                "tags": ["stub", "mock", "debug"],
            }
        ],
        "capabilities": {
            "streaming": True,
            "pushNotifications": False,
            "extensions": [
                {"uri": TASK_T_EXTENSION_URI, "description": "Task-T structured prompt requests"},
                {"uri": NOTIFICATION_T_EXTENSION_URI, "description": "Notification-T structured prompt requests"},
                {"uri": AUTHORIZATION_T_EXTENSION_URI, "description": "Authorization-T structured prompt requests"},
                {"uri": NEGOTIATION_T_EXTENSION_URI, "description": "Negotiation-T structured prompt messages"},
            ],
        },
        "supportedInterfaces": [
            {"protocolBinding": "HTTP+JSON", "protocolVersion": "1.0.0", "url": public_url}
        ],
    }


def build_agent_card(public_url: str):
    return ParseDict(build_agent_card_payload(public_url), AgentCard())


from a2a.types import AgentCard
```

注意：把 `from a2a.types import AgentCard` 移到文件顶部 import 区（与上述其余 import 合并），不要真的放在文件末尾。

- [ ] **Step 4: 写 `server/openan_debug/agent/flow_env.py`**

```python
from pathlib import Path

from a2a_t.common.prompt_resources.resource_access import PackagedPromptResourceAccess
from a2a_t.core.metadata import (
    AUTHORIZATION_T_EXTENSION_URI,
    NEGOTIATION_T_EXTENSION_URI,
    NOTIFICATION_T_EXTENSION_URI,
    TASK_T_EXTENSION_URI,
)
from a2a_t.server.a2at_server import A2ATServer

EXT_URI_BY_PREFIX = {
    "Task-T": TASK_T_EXTENSION_URI,
    "Notification-T": NOTIFICATION_T_EXTENSION_URI,
    "Authorization-T": AUTHORIZATION_T_EXTENSION_URI,
    "Negotiation-T": NEGOTIATION_T_EXTENSION_URI,
}

FALLBACK_ENV = """A2AT_LLM_PROVIDER=openai
A2AT_LLM_MODEL=dummy
A2AT_LLM_API_KEY=dummy
A2AT_LLM_BASE_URL=http://127.0.0.1:9
A2AT_LLM_MAX_ATTEMPTS=1
A2AT_LANGUAGE=zh-CN
"""


def ext_uri_for(template_uri: str | None) -> str | None:
    if not template_uri:
        return None
    return EXT_URI_BY_PREFIX.get(template_uri.split("/", 1)[0])


class FlowEnvironment:
    def __init__(self, settings):
        self.settings = settings
        self.language = settings.language
        self.cursor: dict = {}
        self.schema_access = PackagedPromptResourceAccess()
        self._schema_cache: dict = {}
        env_path = settings.env_path if settings.env_path.exists() else None
        try:
            self.a2at = A2ATServer(env_path=env_path)
        except Exception:
            fallback = Path("data/a2at-fallback.env")
            fallback.parent.mkdir(parents=True, exist_ok=True)
            fallback.write_text(FALLBACK_ENV, encoding="utf-8")
            self.a2at = A2ATServer(env_path=fallback)

    def schema_for(self, template_uri: str):
        if template_uri in self._schema_cache:
            return self._schema_cache[template_uri]
        try:
            schema = self.schema_access.slot_schema(template_uri, self.language)
        except Exception:
            schema = None
        self._schema_cache[template_uri] = schema
        return schema
```

- [ ] **Step 5: 写 `server/openan_debug/agent/executor.py`**

```python
import copy
import time
import uuid

from google.protobuf.json_format import MessageToDict, ParseDict

from a2a.server.agent_execution.agent_executor import AgentExecutor
from a2a.server.agent_execution.context import RequestContext
from a2a.server.events.event_queue import EventQueue
from a2a.types import Artifact, Task, TaskState, TaskStatusUpdateEvent, TaskArtifactUpdateEvent
from sqlalchemy.orm import Session

from ..protocol_flow import FlowRequest, FlowResult, run_flow
from ..stub_service import pick_variant
from .flow_env import ext_uri_for

STATE_JSON = {
    "COMPLETED": "TASK_STATE_COMPLETED",
    "REJECTED": "TASK_STATE_REJECTED",
    "CANCELED": "TASK_STATE_CANCELED",
    "INPUT_REQUIRED": "TASK_STATE_INPUT_REQUIRED",
    "FAILED": "TASK_STATE_FAILED",
}


def extract_request(context: RequestContext):
    exts = getattr(context, "requested_extensions", None)
    if not exts:
        call_context = getattr(context, "call_context", None)
        exts = getattr(call_context, "requested_extensions", None) if call_context is not None else None
    exts = set(exts or ())
    message = context.message
    if message is None or not message.metadata:
        return None, "", None, exts
    metadata = MessageToDict(message.metadata)
    template_uri = metadata.get("templateUri")
    ext_uri = ext_uri_for(template_uri)
    prompt_text = str(metadata.get(ext_uri, "")) if ext_uri else ""
    raw_context = metadata.get("negotiationContext")
    negotiation_context = raw_context if isinstance(raw_context, dict) else None
    return template_uri, prompt_text, negotiation_context, exts


def artifact_name(template_uri: str | None) -> str:
    if template_uri:
        segments = template_uri.rstrip("/").split("/")
        if len(segments) >= 2:
            return f"stub.{segments[-2]}"
    return "stub.result"


class MockAgentExecutor(AgentExecutor):
    def __init__(self, flow_env, runtime: dict, log_sink=None):
        self._flow_env = flow_env
        self._runtime = runtime
        self._log_sink = log_sink

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        return None

    def _stub_fn(self, template_uri):
        engine = self._runtime.get("engine")
        if engine is None or template_uri is None:
            return None
        with Session(engine) as session:
            variant = pick_variant(session, self._runtime["agent_id"], template_uri, self._flow_env.cursor)
            return copy.deepcopy(variant.variant_json) if variant else None

    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        started = time.monotonic()
        template_uri, prompt_text, negotiation_context, exts = extract_request(context)
        task_id = context.task_id or str(uuid.uuid4())
        context_id = context.context_id or str(uuid.uuid4())
        try:
            flow = run_flow(
                self._flow_env.a2at,
                self._flow_env,
                FlowRequest(
                    template_uri=template_uri,
                    prompt_text=prompt_text,
                    negotiation_context=negotiation_context,
                    requested_extensions=exts,
                ),
                self._stub_fn,
                fallback_enabled=self._runtime["settings"].stub_fallback,
            )
        except Exception as error:
            flow = FlowResult(
                state="FAILED",
                message_text=f"internal error: {error}",
                reply_metadata={},
                artifact_data=None,
                negotiated=False,
            )
        await self._enqueue(context, event_queue, task_id, context_id, flow, template_uri)
        if self._log_sink is not None:
            entry = {
                "agent_id": self._runtime.get("agent_id"),
                "template_uri": template_uri,
                "direction": "inbound",
                "request_body": {
                    "templateUri": template_uri,
                    "promptText": prompt_text,
                    "negotiationContext": negotiation_context,
                    "requestedExtensions": sorted(exts),
                },
                "response_body": {
                    "state": flow.state,
                    "message": flow.message_text,
                    "artifact": flow.artifact_data,
                    "replyMetadata": flow.reply_metadata,
                },
                "task_state": flow.state,
                "negotiated": flow.negotiated,
                "latency_ms": int((time.monotonic() - started) * 1000),
            }
            await self._log_sink(entry)

    async def _enqueue(self, context, event_queue, task_id, context_id, flow: FlowResult, template_uri):
        initial = ParseDict(
            {"id": task_id, "contextId": context_id, "status": {"state": "TASK_STATE_SUBMITTED"}}, Task()
        )
        await event_queue.enqueue_event(initial)
        if flow.state == "COMPLETED":
            await self._update_status(context, event_queue, task_id, context_id, "TASK_STATE_WORKING", "processing")
            artifact = ParseDict(
                {
                    "artifactId": str(uuid.uuid4()),
                    "name": artifact_name(template_uri),
                    "parts": [{"data": flow.artifact_data}],
                },
                Artifact(),
            )
            await event_queue.enqueue_event(
                TaskArtifactUpdateEvent(task_id=task_id, context_id=context_id, artifact=artifact, last_chunk=True)
            )
        elif flow.state == "INPUT_REQUIRED":
            await self._update_status(context, event_queue, task_id, context_id, "TASK_STATE_WORKING", "negotiating")
        await self._update_status(
            context, event_queue, task_id, context_id, STATE_JSON[flow.state], flow.message_text, flow.reply_metadata
        )

    async def _update_status(self, context, event_queue, task_id, context_id, state_json, text, metadata=None):
        status_payload = {
            "state": state_json,
            "message": {
                "contextId": context_id,
                "taskId": task_id,
                "role": "ROLE_AGENT",
                "parts": [{"text": text}],
            },
        }
        if metadata:
            status_payload["message"]["metadata"] = metadata
        status = ParseDict(status_payload, TaskStatus.from_proto_type() if False else __import__("a2a.types", fromlist=["TaskStatus"]).TaskStatus())
        current = Task()
        if context.current_task is not None:
            current.CopyFrom(context.current_task)
        current.id = task_id
        current.context_id = context_id
        current.status.CopyFrom(status)
        context.current_task = current
        await event_queue.enqueue_event(
            TaskStatusUpdateEvent(task_id=task_id, context_id=context_id, status=status)
        )
```

修正说明（实施时直接采用）：`_update_status` 中构造 `TaskStatus` 的那行写得过于花哨，直接改为：

```python
from a2a.types import TaskStatus
status = ParseDict(status_payload, TaskStatus())
```

并把 `TaskStatus` 加入顶部 `from a2a.types import (...)` 导入列表。

- [ ] **Step 6: 写 `server/openan_debug/agent/a2a_app.py`**

```python
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.routes import create_agent_card_routes, create_rest_routes
from a2a.server.tasks.inmemory_task_store import InMemoryTaskStore
from starlette.applications import Starlette

from .agent_card import build_agent_card
from .executor import MockAgentExecutor


class EchoExtensionsMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = {key: value for key, value in scope["headers"]}
        extension_header = headers.get(b"a2a-extensions")

        async def send_wrapper(message):
            if message["type"] == "http.response.start" and extension_header:
                message.setdefault("headers", []).append((b"a2a-extensions", extension_header))
            await send(message)

        await self.app(scope, receive, send_wrapper)


def build_a2a_app(public_url: str, executor: MockAgentExecutor):
    agent_card = build_agent_card(public_url)
    handler = DefaultRequestHandler(
        agent_executor=executor, task_store=InMemoryTaskStore(), agent_card=agent_card
    )
    routes = [*create_agent_card_routes(agent_card), *create_rest_routes(handler)]
    return EchoExtensionsMiddleware(Starlette(routes=routes))
```

- [ ] **Step 7: 改写 `server/openan_debug/main.py`（完整文件）**

```python
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
from .routers.auth_router import router as auth_router
from .routers.users_router import router as users_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings: Settings = app.state.settings
    app.state.engine = make_engine(settings)
    init_db(app.state.engine, settings)
    with Session(app.state.engine) as session:
        app.state.runtime["agent_id"] = session.scalar(select(Agent.id).limit(1))
    app.state.runtime["engine"] = app.state.engine
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


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    app = FastAPI(title="OpenAN-Debug", lifespan=lifespan)
    app.state.settings = settings
    app.state.runtime = {"engine": None, "agent_id": None}
    app.state.flow_env = FlowEnvironment(settings)
    executor = MockAgentExecutor(
        app.state.flow_env, app.state.runtime, log_sink=lambda entry: _log_sink(app.state.runtime, entry)
    )
    app.include_router(auth_router)
    app.include_router(users_router)
    app.mount("/debug/a2a", build_a2a_app(settings.public_agent_url, executor))

    @app.get("/api/v1/health")
    async def health():
        return {"status": "ok"}

    return app
```

- [ ] **Step 8: 运行测试通过**

Run（workdir `server`）: `uv run pytest tests/test_agent_app.py tests/test_protocol_flow.py -v`
Expected: 全部 passed。`test_send_message_fallback_returns_stub_artifact` 走降级链路：check_task_prompt 的 LLM 步骤连 `127.0.0.1:9` 被拒 → `llm.invocation_failed` → 降级按 templateUri 返回变体。若 `-CRYPTIC protobuf 错误`：核对 ParseDict 的字段名使用 camelCase（taskId/contextId/artifactId/state/role）。

- [ ] **Step 9: Commit**

```bash
git add server/openan_debug server/tests/test_agent_app.py
git commit -m "feat(server): mount A2A-T mock agent - executor, agent card, extension echo, request logs"
```

---

### Task 7: 种子与变体管理 API

**Files:**
- Create: `server/openan_debug/routers/seeds_router.py`, `server/openan_debug/routers/variants_router.py`
- Modify: `server/openan_debug/main.py`（include 两个 router）
- Create: `server/tests/test_seeds_api.py`, `server/tests/test_variants_api.py`

- [ ] **Step 1: 写失败测试 `server/tests/test_seeds_api.py`**

```python
from tests.conftest import SUBSCRIBE_INCIDENT_URI, auth_header


def test_seed_crud(client, admin_token):
    headers = auth_header(admin_token)
    resp = client.post(
        "/api/v1/seeds",
        json={"name": "s1", "templateUri": SUBSCRIBE_INCIDENT_URI, "seedJson": {"k": "v"}, "description": "d"},
        headers=headers,
    )
    assert resp.status_code == 201
    seed_id = resp.json()["id"]
    assert resp.json()["templateUri"] == SUBSCRIBE_INCIDENT_URI
    resp = client.get("/api/v1/seeds", headers=headers)
    assert any(s["id"] == seed_id for s in resp.json())
    resp = client.patch(f"/api/v1/seeds/{seed_id}", json={"name": "s1b"}, headers=headers)
    assert resp.json()["name"] == "s1b"
    resp = client.delete(f"/api/v1/seeds/{seed_id}", headers=headers)
    assert resp.status_code == 204
    assert client.get("/api/v1/seeds", headers=headers).json() == []


def test_seed_requires_auth(client):
    assert client.get("/api/v1/seeds").status_code == 401


def test_seed_invalid_json_rejected(client, admin_token):
    headers = auth_header(admin_token)
    resp = client.post(
        "/api/v1/seeds",
        json={"name": "s", "templateUri": SUBSCRIBE_INCIDENT_URI, "seedJson": "not-a-dict"},
        headers=headers,
    )
    assert resp.status_code == 422
```

`server/tests/test_variants_api.py`：

```python
from tests.conftest import SUBSCRIBE_INCIDENT_URI, auth_header


def _make_seed(client, headers):
    return client.post(
        "/api/v1/seeds",
        json={"name": "s", "templateUri": SUBSCRIBE_INCIDENT_URI, "seedJson": {"k": "v"}},
        headers=headers,
    ).json()["id"]


def test_import_variants(client, admin_token):
    headers = auth_header(admin_token)
    seed_id = _make_seed(client, headers)
    resp = client.post(
        "/api/v1/variants/import",
        json={
            "seedId": seed_id,
            "templateUri": SUBSCRIBE_INCIDENT_URI,
            "variants": [{"incident": {"csn": "A1"}}, {"incident": {"csn": "A2"}}],
        },
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["imported"] == 2
    variants = client.get("/api/v1/variants", headers=headers).json()
    assert len(variants) == 2
    assert variants[0]["seq"] == 0 and variants[1]["seq"] == 1
    assert variants[0]["source"] == "import"


def test_import_rejects_non_dict_variant(client, admin_token):
    headers = auth_header(admin_token)
    resp = client.post(
        "/api/v1/variants/import",
        json={"templateUri": SUBSCRIBE_INCIDENT_URI, "variants": ["not-dict"]},
        headers=headers,
    )
    assert resp.status_code == 422


def test_import_second_batch_continues_seq(client, admin_token):
    headers = auth_header(admin_token)
    client.post(
        "/api/v1/variants/import",
        json={"templateUri": SUBSCRIBE_INCIDENT_URI, "variants": [{"n": 1}]},
        headers=headers,
    )
    resp = client.post(
        "/api/v1/variants/import",
        json={"templateUri": SUBSCRIBE_INCIDENT_URI, "variants": [{"n": 2}]},
        headers=headers,
    )
    assert resp.json()["firstSeq"] == 1


def test_variant_enable_toggle(client, admin_token):
    headers = auth_header(admin_token)
    client.post(
        "/api/v1/variants/import",
        json={"templateUri": SUBSCRIBE_INCIDENT_URI, "variants": [{"n": 1}]},
        headers=headers,
    )
    variant_id = client.get("/api/v1/variants", headers=headers).json()[0]["id"]
    resp = client.patch(f"/api/v1/variants/{variant_id}", json={"enabled": False}, headers=headers)
    assert resp.json()["enabled"] is False
    variants = client.get("/api/v1/variants", headers=auth_header(admin_token)).json()
    assert variants[0]["enabled"] is False
```

- [ ] **Step 2: 运行确认失败**

Run（workdir `server`）: `uv run pytest tests/test_seeds_api.py tests/test_variants_api.py -v`
Expected: FAIL（404，路由不存在）

- [ ] **Step 3: 写 `seeds_router.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..deps import get_db
from ..models import Agent, Seed, Variant
from ..schemas import SeedCreate, SeedPatch

router = APIRouter(prefix="/api/v1/seeds", tags=["seeds"])


def _seed_view(seed: Seed, variant_count: int) -> dict:
    return {
        "id": seed.id,
        "agentId": seed.agent_id,
        "templateUri": seed.template_uri,
        "name": seed.name,
        "seedJson": seed.seed_json,
        "description": seed.description,
        "createdBy": seed.created_by,
        "variantCount": variant_count,
    }


def _default_agent_id(db: Session) -> int:
    agent_id = db.scalar(select(Agent.id).limit(1))
    if agent_id is None:
        agent = Agent()
        db.add(agent)
        db.commit()
        db.refresh(agent)
        return agent.id
    return agent_id


@router.get("")
def list_seeds(db: Session = Depends(get_db), _: dict = Depends(get_current_user)):
    seeds = db.scalars(select(Seed).order_by(Seed.id.desc())).all()
    counts = dict(
        db.execute(select(Variant.seed_id, Variant.id).where(Variant.seed_id.is_not(None))).all()
        and []
        or []
    )
    result = []
    for seed in seeds:
        count = len(db.scalars(select(Variant.id).where(Variant.seed_id == seed.id)).all())
        result.append(_seed_view(seed, count))
    return result


@router.post("", status_code=201)
def create_seed(body: SeedCreate, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    seed = Seed(
        agent_id=_default_agent_id(db),
        template_uri=body.templateUri,
        name=body.name,
        seed_json=body.seedJson,
        description=body.description,
        created_by=user["username"],
    )
    db.add(seed)
    db.commit()
    db.refresh(seed)
    return _seed_view(seed, 0)


@router.patch("/{seed_id}")
def patch_seed(seed_id: int, body: SeedPatch, db: Session = Depends(get_db), _: dict = Depends(get_current_user)):
    seed = db.get(Seed, seed_id)
    if seed is None:
        raise HTTPException(status_code=404, detail="Seed not found")
    if body.name is not None:
        seed.name = body.name
    if body.templateUri is not None:
        seed.template_uri = body.templateUri
    if body.seedJson is not None:
        seed.seed_json = body.seedJson
    if body.description is not None:
        seed.description = body.description
    db.commit()
    count = len(db.scalars(select(Variant.id).where(Variant.seed_id == seed.id)).all())
    return _seed_view(seed, count)


@router.delete("/{seed_id}", status_code=204)
def delete_seed(seed_id: int, db: Session = Depends(get_db), _: dict = Depends(get_current_user)):
    seed = db.get(Seed, seed_id)
    if seed is None:
        raise HTTPException(status_code=404, detail="Seed not found")
    for variant in db.scalars(select(Variant).where(Variant.seed_id == seed_id)).all():
        variant.seed_id = None
    db.delete(seed)
    db.commit()
```

注意：`list_seeds` 里那行 `counts = dict(...and [] or [])` 是无用残留，实施时删除，只保留循环内 count 查询。

- [ ] **Step 4: 写 `variants_router.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..deps import get_db
from ..models import Agent, Variant
from ..schemas import VariantImportRequest, VariantPatch
from .seeds_router import _default_agent_id

router = APIRouter(prefix="/api/v1/variants", tags=["variants"])


def _variant_view(variant: Variant) -> dict:
    return {
        "id": variant.id,
        "seedId": variant.seed_id,
        "agentId": variant.agent_id,
        "templateUri": variant.template_uri,
        "variantJson": variant.variant_json,
        "enabled": variant.enabled,
        "source": variant.source,
        "seq": variant.seq,
    }


@router.get("")
def list_variants(template_uri: str | None = None, db: Session = Depends(get_db), _: dict = Depends(get_current_user)):
    query = select(Variant).order_by(Variant.template_uri, Variant.seq, Variant.id)
    if template_uri:
        query = query.where(Variant.template_uri == template_uri)
    return [_variant_view(v) for v in db.scalars(query).all()]


@router.post("/import")
def import_variants(body: VariantImportRequest, db: Session = Depends(get_db), _: dict = Depends(get_current_user)):
    for index, item in enumerate(body.variants):
        if not isinstance(item, dict):
            raise HTTPException(status_code=422, detail=f"variants[{index}] must be a JSON object")
    agent_id = _default_agent_id(db)
    first_seq = db.scalar(
        select(func.coalesce(func.max(Variant.seq) + 1, 0)).where(
            Variant.agent_id == agent_id, Variant.template_uri == body.templateUri
        )
    )
    created = []
    for offset, item in enumerate(body.variants):
        variant = Variant(
            seed_id=body.seedId,
            agent_id=agent_id,
            template_uri=body.templateUri,
            variant_json=item,
            enabled=True,
            source="import",
            seq=first_seq + offset,
        )
        db.add(variant)
        created.append(variant)
    db.commit()
    for variant in created:
        db.refresh(variant)
    return {"imported": len(created), "firstSeq": first_seq, "ids": [v.id for v in created]}


@router.patch("/{variant_id}")
def patch_variant(variant_id: int, body: VariantPatch, db: Session = Depends(get_db), _: dict = Depends(get_current_user)):
    variant = db.get(Variant, variant_id)
    if variant is None:
        raise HTTPException(status_code=404, detail="Variant not found")
    if body.enabled is not None:
        variant.enabled = body.enabled
    if body.variantJson is not None:
        variant.variant_json = body.variantJson
    db.commit()
    return _variant_view(variant)
```

- [ ] **Step 5: 在 `main.py` 的 include 区追加**

```python
from .routers.seeds_router import router as seeds_router
from .routers.variants_router import router as variants_router
```
```python
    app.include_router(seeds_router)
    app.include_router(variants_router)
```

- [ ] **Step 6: 运行测试通过**

Run（workdir `server`）: `uv run pytest tests/test_seeds_api.py tests/test_variants_api.py tests/test_agent_app.py -v`
Expected: 全部 passed

- [ ] **Step 7: Commit**

```bash
git add server/openan_debug server/tests
git commit -m "feat(server): seeds CRUD and stub variant import/toggle API"
```

---

### Task 8: 调试台与请求历史 API

**Files:**
- Create: `server/openan_debug/routers/console_router.py`, `server/openan_debug/routers/history_router.py`
- Modify: `server/openan_debug/schemas.py`（追加 ConsoleSendRequest）, `server/openan_debug/main.py`
- Create: `server/tests/test_console_history_api.py`

- [ ] **Step 1: 在 `schemas.py` 追加**

```python
class ConsoleSendRequest(BaseModel):
    request: dict
    note: str = ""
```

- [ ] **Step 2: 写失败测试 `server/tests/test_console_history_api.py`**

```python
import uuid

import httpx
import pytest

from openan_debug.routers import console_router
from tests.conftest import SUBSCRIBE_INCIDENT_URI, auth_header


def _request_body():
    return {
        "message": {
            "messageId": str(uuid.uuid4()),
            "role": "ROLE_USER",
            "parts": [{"text": "subscribe incident"}],
            "metadata": {
                "templateUri": SUBSCRIBE_INCIDENT_URI,
                "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Notification-T/v1": "prompt",
            },
        }
    }


def test_console_send_forwards_and_logs(client, admin_token, monkeypatch):
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["headers"] = dict(request.headers)
        captured["body"] = request.read()
        return httpx.Response(200, json={"task": {"id": "t-1", "status": {"state": "TASK_STATE_COMPLETED"}}})

    def fake_client_factory(**kwargs):
        return httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=kwargs.get("timeout"))

    monkeypatch.setattr(console_router.httpx, "AsyncClient", fake_client_factory)
    resp = client.post(
        "/api/v1/console/send", json={"request": _request_body(), "note": "manual"}, headers=auth_header(admin_token)
    )
    assert resp.status_code == 200
    assert resp.json()["response"]["task"]["id"] == "t-1"
    assert captured["url"].endswith("/debug/a2a/message:send")
    assert captured["headers"]["a2a-extensions"].endswith("Notification-T/v1")
    history = client.get("/api/v1/history?direction=console", headers=auth_header(admin_token)).json()
    assert history["total"] == 1
    assert history["items"][0]["user_id"] is not None


def test_console_send_backend_error_recorded(client, admin_token, monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    def fake_client_factory(**kwargs):
        return httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=kwargs.get("timeout"))

    monkeypatch.setattr(console_router.httpx, "AsyncClient", fake_client_factory)
    resp = client.post("/api/v1/console/send", json={"request": _request_body()}, headers=auth_header(admin_token))
    assert resp.status_code == 200
    assert resp.json()["status"] == 500
    history = client.get("/api/v1/history", headers=auth_header(admin_token)).json()
    assert history["total"] == 1


def test_history_filters_and_detail(client, admin_token):
    headers = auth_header(admin_token)
    client.post(
        "/api/v1/console/send",
        json={"request": _request_body()},
        headers=headers,
    )
    listing = client.get(
        f"/api/v1/history?templateUri={SUBSCRIBE_INCIDENT_URI}", headers=headers
    ).json()
    assert listing["total"] >= 1
    detail_id = listing["items"][0]["id"]
    detail = client.get(f"/api/v1/history/{detail_id}", headers=headers)
    assert detail.status_code == 200
    assert "request_body" in detail.json()
    assert client.get("/api/v1/history/999999", headers=headers).status_code == 404
```

- [ ] **Step 3: 运行确认失败**

Run（workdir `server`）: `uv run pytest tests/test_console_history_api.py -v`
Expected: FAIL（404，路由不存在）

- [ ] **Step 4: 写 `console_router.py`**

```python
import time

import httpx
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from ..agent.flow_env import ext_uri_for
from ..auth import get_current_user
from ..deps import get_db, get_settings
from ..models import RequestLog
from ..schemas import ConsoleSendRequest

router = APIRouter(prefix="/api/v1/console", tags=["console"])

DEFAULT_EXTENSION = "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1"


def _derive_extension(request_body: dict) -> str:
    message = request_body.get("message") or {}
    metadata = message.get("metadata") or {}
    template_uri = metadata.get("templateUri")
    return ext_uri_for(template_uri) or DEFAULT_EXTENSION


@router.post("/send")
async def console_send(
    body: ConsoleSendRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    settings=Depends(get_settings),
):
    headers = {
        "A2A-Version": "1.0",
        "A2A-Extensions": _derive_extension(body.request),
        "Content-Type": "application/json",
    }
    started = time.monotonic()
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(settings.agent_internal_url, json=body.request, headers=headers)
    latency_ms = int((time.monotonic() - started) * 1000)
    try:
        response_json = response.json()
    except ValueError:
        response_json = {"raw": response.text}
    db.add(
        RequestLog(
            template_uri=(body.request.get("message", {}).get("metadata", {}) or {}).get("templateUri"),
            direction="console",
            request_body={"note": body.note, "request": body.request},
            response_body={"status": response.status_code, "response": response_json},
            task_state=None,
            negotiated=False,
            latency_ms=latency_ms,
            user_id=_resolve_user_id(db, user["username"]),
        )
    )
    db.commit()
    return {"status": response.status_code, "response": response_json, "latencyMs": latency_ms}


def _resolve_user_id(db: Session, username: str):
    from ..models import User

    user = db.scalar(__import__("sqlalchemy", fromlist=["select"]).select(User).where(User.username == username))
    return user.id if user else None
```

修正说明（实施时直接采用）：`_resolve_user_id` 写法过于晦涩，改为文件顶部正常导入：

```python
from sqlalchemy import select
from ..models import RequestLog, User
```
```python
def _resolve_user_id(db: Session, username: str):
    user = db.scalar(select(User).where(User.username == username))
    return user.id if user else None
```

- [ ] **Step 5: 写 `history_router.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..deps import get_db
from ..models import RequestLog

router = APIRouter(prefix="/api/v1/history", tags=["history"])


@router.get("")
def list_history(
    templateUri: str | None = None,
    direction: str | None = None,
    state: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    query = select(RequestLog)
    if templateUri:
        query = query.where(RequestLog.template_uri == templateUri)
    if direction:
        query = query.where(RequestLog.direction == direction)
    if state:
        query = query.where(RequestLog.task_state == state)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    items = db.scalars(query.order_by(RequestLog.id.desc()).offset(offset).limit(min(limit, 200))).all()
    return {
        "total": total,
        "items": [
            {
                "id": item.id,
                "templateUri": item.template_uri,
                "direction": item.direction,
                "taskState": item.task_state,
                "negotiated": item.negotiated,
                "latencyMs": item.latency_ms,
                "createdAt": item.created_at.isoformat() if item.created_at else None,
                "requestBody": item.request_body,
                "responseBody": item.response_body,
            }
            for item in items
        ],
    }


@router.get("/{log_id}")
def get_history(log_id: int, db: Session = Depends(get_db), _: dict = Depends(get_current_user)):
    item = db.get(RequestLog, log_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Log not found")
    return {
        "id": item.id,
        "templateUri": item.template_uri,
        "direction": item.direction,
        "taskState": item.task_state,
        "negotiated": item.negotiated,
        "latencyMs": item.latency_ms,
        "createdAt": item.created_at.isoformat() if item.created_at else None,
        "requestBody": item.request_body,
        "responseBody": item.response_body,
    }
```

- [ ] **Step 6: 在 `main.py` include**

```python
from .routers.console_router import router as console_router
from .routers.history_router import router as history_router
```
```python
    app.include_router(console_router)
    app.include_router(history_router)
```

- [ ] **Step 7: 运行全部后端测试**

Run（workdir `server`）: `uv run pytest -v`
Expected: 全部 passed

- [ ] **Step 8: Commit**

```bash
git add server/openan_debug server/tests
git commit -m "feat(server): debug console proxy API and request history API"
```

---

### Task 9: 端到端测试（真实 a2a ClientFactory + 本地 uvicorn）

**Files:**
- Create: `server/tests/test_e2e_sample_client.py`

- [ ] **Step 1: 写测试 `server/tests/test_e2e_sample_client.py`**

```python
import threading
import time
import uuid

import httpx
import pytest
import uvicorn
from a2a.client.client import ClientConfig, ClientCallContext
from a2a.client.client_factory import ClientFactory
from a2a.types import TransportProtocol
from a2a_t.client.a2at_client import A2ATClient
from a2a_t.common.prompt_resources.resource_access import PackagedPromptResourceAccess
from a2a_t.core.metadata import NOTIFICATION_T_EXTENSION_URI
from a2a_t.core.standard_templates import SUBSCRIBE_INCIDENT_URI
from google.protobuf.json_format import ParseDict

from tests.conftest import SUBSCRIBE_INCIDENT_URI as SEED_URI

PORT = 9911


def _start_server(app):
    config = uvicorn.Config(app, host="127.0.0.1", port=PORT, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(100):
        if server.started:
            break
        time.sleep(0.1)
    assert server.started, "uvicorn failed to start"
    return server


def _stop_server(server):
    server.should_exit = True
    time.sleep(0.5)


@pytest.fixture()
def live_client(app, seed_variant):
    server = _start_server(app)
    try:
        httpx_client = httpx.AsyncClient(base_url=f"http://127.0.0.1:{PORT}", timeout=60, trust_env=False)
        from a2a.types import AgentCard

        from openan_debug.agent.agent_card import build_agent_card_payload

        agent_card = ParseDict(
            build_agent_card_payload(f"http://127.0.0.1:{PORT}/debug/a2a"), AgentCard()
        )
        factory = ClientFactory(
            ClientConfig(
                httpx_client=httpx_client,
                supported_protocol_bindings=[TransportProtocol.HTTP_JSON],
                use_client_preference=True,
            )
        )
        a2a_client = factory.create(agent_card)
        yield a2a_client
    finally:
        _stop_server(server)


def test_e2e_stub_roundtrip(settings, seed_variant, live_client):
    prompt_client = A2ATClient(env_path=settings.env_path)
    schema = PackagedPromptResourceAccess().slot_schema(SUBSCRIBE_INCIDENT_URI, "zh-CN")
    data = {
        "通知主题": "Incident",
        "订阅条件": "故障优先级为：严重、高。故障名称为：光纤中断。",
        "上报通知数据格式": "通过DataPart上报Incident数据。",
    }
    metadata_content = prompt_client.generate_task_prompt_from_data_with_schema(data, schema, SEED_URI)
    metadata = metadata_content.build_metadata_content()
    request = ParseDict(
        {
            "message": {
                "messageId": str(uuid.uuid4()),
                "role": "ROLE_USER",
                "parts": [{"text": "subscribe incident"}],
                "metadata": metadata,
            }
        },
        __import__("a2a.types", fromlist=["SendMessageRequest"]).SendMessageRequest(),
    )
    call_context = ClientCallContext.model_validate(
        {"service_parameters": {"A2A-Extensions": NOTIFICATION_T_EXTENSION_URI}, "state": {}, "timeout": None}
    )

    import asyncio

    async def _run():
        events = []
        async for stream_response in live_client.send_message(request, context=call_context):
            events.append(stream_response)
        return events

    events = asyncio.run(_run())
    assert events, "no events received"
    saw_completed = False
    saw_artifact = False

    def _walk(value):
        nonlocal saw_completed, saw_artifact
        if isinstance(value, dict):
            if "TASK_STATE_COMPLETED" in value.get("state", "") or value.get("state") == 3:
                saw_completed = True
            if "faultManagement.Incident" in value:
                saw_artifact = True
            for child in value.values():
                _walk(child)
        elif isinstance(value, list):
            for child in value:
                _walk(child)
        else:
            text = str(value)
            if "faultManagement.Incident" in text:
                saw_artifact = True

    from google.protobuf.json_format import MessageToDict

    for event in events:
        _walk(MessageToDict(event)) if hasattr(event, "SerializeToString") else _walk(
            event.__dict__
        )
    assert saw_artifact, f"stub artifact missing in events: {events}"
```

修正说明（实施时直接采用）：底部事件归一化写法晦涩，替换为：

```python
    from google.protobuf.json_format import MessageToDict

    for event in events:
        for field_name in ("status_update", "message", "artifact_update", "task"):
            child = getattr(event, field_name, None)
            if child is not None and hasattr(child, "SerializeToString"):
                _walk(MessageToDict(child))
    assert saw_artifact, f"stub artifact missing in events: {[str(e)[:200] for e in events]}"
```

同时把 `ClientCallContext.model_validate({"service_parameters": ..., "state": {}, "timeout": None})` 保留（ClientCallContext 是 pydantic 模型，service_parameters 键名以字段别名为准；若校验失败，改用 `ClientCallContext(state={}, timeout=None, service_parameters={"A2A-Extensions": NOTIFICATION_T_EXTENSION_URI})` 构造）。

- [ ] **Step 2: 运行测试**

Run（workdir `server`）: `uv run pytest tests/test_e2e_sample_client.py -v`
Expected: 1 passed（降级链路：真实 A2A 客户端 → HTTP → executor → stub Artifact）
若客户端构造报错：以 `a2a/client/client_factory.py` 实际签名为准微调（已在必读第 2 条给出核实过的签名）。

- [ ] **Step 3: Commit**

```bash
git add server/tests/test_e2e_sample_client.py
git commit -m "test(server): e2e stub roundtrip over real A2A REST client and live uvicorn"
```

---

### Task 10: 本地泛化 CLI 工具

**Files:**
- Create: `tools/stub_generator/cli.py`, `tools/stub_generator/test_stub_generator.py`, `tools/stub_generator/README.md`

- [ ] **Step 1: 写失败测试 `tools/stub_generator/test_stub_generator.py`**

```python
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from cli import build_messages, parse_variants, run_generation


class FakeCompletion:
    def __init__(self, content):
        self.message = type("M", (), {"content": content})()


class FakeClient:
    def __init__(self, content):
        self.chat = type("C", (), {"completions": type("X", (), {"create": lambda self, **kw: FakeCompletion(content)})()})()
        self.calls = []


def test_parse_variants_handles_fences():
    content = '```json\n[{"a": 1}, {"a": 2}]\n```'
    assert parse_variants(content) == [{"a": 1}, {"a": 2}]


def test_parse_variants_rejects_non_array():
    import pytest

    with pytest.raises(ValueError):
        parse_variants('{"a": 1}')


def test_build_messages_contains_seed_and_count():
    messages = build_messages({"faultManagement.Incident": {"csn": "INC-1"}}, "Task-T/x/v1", 5)
    text = json.dumps(messages, ensure_ascii=False)
    assert "INC-1" in text and "5" in text and "Task-T/x/v1" in text


def test_run_generation_writes_output(tmp_path):
    payload = [{"faultManagement.Incident": {"csn": "INC-2"}}]
    client = FakeClient(json.dumps(payload, ensure_ascii=False))
    out = tmp_path / "out.json"
    result = run_generation(client, "gpt-x", {"faultManagement.Incident": {"csn": "INC-1"}}, "Task-T/x/v1", 1, out)
    assert result["templateUri"] == "Task-T/x/v1"
    assert result["variants"] == payload
    assert json.loads(out.read_text(encoding="utf-8")) == result
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tools/stub_generator/test_stub_generator.py -v`
Expected: FAIL（No module named cli）

- [ ] **Step 3: 写 `tools/stub_generator/cli.py`**

```python
import argparse
import json
import re
import sys
from pathlib import Path

SYSTEM_PROMPT = (
    "你是电信联调打桩数据生成器。给定一条种子 JSON（真实业务样本）和模板 URI，"
    "生成 N 条结构完全相同、仅替换标识性取值（单号、ID、名称、时间、数值、优先级等）的变体。"
    "变体必须保持与种子完全一致的字段名和嵌套结构，取值必须符合电信业务语义。"
    "只输出一个 JSON 数组，不要输出任何解释或 Markdown 代码块之外的内容。"
)


def build_messages(seed: dict, template_uri: str, count: int) -> list:
    user_prompt = (
        f"模板 URI: {template_uri}\n"
        f"生成变体条数: {count}\n"
        f"种子 JSON:\n{json.dumps(seed, ensure_ascii=False, indent=2)}\n"
        "请输出包含恰好 "
        f"{count} 条变体的 JSON 数组。"
    )
    return [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user_prompt}]


def parse_variants(content: str) -> list:
    text = content.strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    data = json.loads(text)
    if not isinstance(data, list) or not data:
        raise ValueError("LLM output is not a non-empty JSON array")
    if not all(isinstance(item, dict) for item in data):
        raise ValueError("LLM output contains non-object variants")
    return data


def run_generation(client, model: str, seed: dict, template_uri: str, count: int, out_path: Path) -> dict:
    response = client.chat.completions.create(
        model=model, messages=build_messages(seed, template_uri, count), temperature=0.8
    )
    variants = parse_variants(response.choices[0].message.content)
    result = {"templateUri": template_uri, "seedCount": 1, "variants": variants}
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="OpenAN-Debug stub variant generator (local LLM)")
    parser.add_argument("--seed", required=True, help="seed JSON file path")
    parser.add_argument("--template-uri", required=True)
    parser.add_argument("--count", type=int, default=5)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--api-key", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--out", default="variants.json")
    args = parser.parse_args()
    from openai import OpenAI

    seed = json.loads(Path(args.seed).read_text(encoding="utf-8"))
    if not isinstance(seed, dict):
        print("seed file must contain a JSON object", file=sys.stderr)
        return 2
    client = OpenAI(base_url=args.base_url, api_key=args.api_key)
    result = run_generation(client, args.model, seed, args.template_uri, args.count, Path(args.out))
    print(f"generated {len(result['variants'])} variants -> {args.out}")
    print("next: import via OpenAN-Debug seeds page or POST /api/v1/variants/import")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: 运行测试通过**

Run: `python -m pytest tools/stub_generator/test_stub_generator.py -v`
Expected: 4 passed（openai 包缺失则先 `pip install openai`，仅本地工具需要）

- [ ] **Step 5: 写 `tools/stub_generator/README.md`**

```markdown
# 本地打桩数据泛化工具

在本地（有 LLM 访问权限的环境）把一条种子样本泛化为 N 条变体，再通过 OpenAN-Debug 页面导入。

## 用法

python cli.py --seed seed.json --template-uri "Notification-T/network-layer/subscribe-incident/v1" --count 5 --base-url https://dashscope.aliyuncs.com/compatible-mode/v1 --api-key sk-xxx --model qwen-plus --out variants.json

## 输入

`seed.json`：一条真实业务样本 JSON（对象）。

## 输出

`variants.json`：
{"templateUri": "...", "seedCount": 1, "variants": [{...}, ...]}

## 导入

OpenAN-Debug 登录 → 种子数据管理 → 选择种子 → 导入变体文件（选择 variants.json）。
```

- [ ] **Step 6: Commit**

```bash
git add tools/stub_generator
git commit -m "feat(tools): local LLM stub variant generator CLI with importable output format"
```

---

### Task 11: 前端骨架与登录页

**Files:**
- Create: `frontend/package.json`, `frontend/vite.config.js`, `frontend/index.html`, `frontend/src/main.jsx`, `frontend/src/App.jsx`, `frontend/src/api.js`, `frontend/src/mock.js`, `frontend/src/templates.js`, `frontend/src/styles.css`, `frontend/src/pages/Login.jsx`

- [ ] **Step 1: 写 `package.json`**

```json
{
  "name": "openan-debug-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: 写 `vite.config.js`**

```js
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/debug/',
  plugins: [react()],
  server: {
    port: 5180,
    proxy: {
      '/debug/api': {
        target: 'http://127.0.0.1:9000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/debug\/api/, '/api'),
      },
      '/debug/a2a': { target: 'http://127.0.0.1:9000', changeOrigin: true },
    },
  },
})
```

- [ ] **Step 3: 写 `index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OpenAN-Debug</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 4: 写 `src/templates.js`**

```js
export const TEMPLATE_URIS = [
  'Task-T/network-layer/private-line-complaint/v1',
  'Task-T/network-layer/ran-energy-saving/v1',
  'Notification-T/network-layer/subscribe-incident/v1',
  'Notification-T/network-layer/service-recovery/v1',
  'Authorization-T/authorization-policy-management/v1',
  'Negotiation-T/information-negotiation/propose/v1',
  'Negotiation-T/information-negotiation/accept-reject/v1',
  'Negotiation-T/target-negotiation/propose/v1',
  'Negotiation-T/target-negotiation/accept-reject/v1',
  'Negotiation-T/feasibility-negotiation/propose/v1',
  'Negotiation-T/feasibility-negotiation/accept-reject/v1',
  'Negotiation-T/common/abort/v1',
]

export const EXTENSION_URIS = {
  'Task-T': 'https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1',
  'Notification-T': 'https://projects.tmforum.org/a2aproject/telecommunication/extensions/Notification-T/v1',
  'Authorization-T': 'https://projects.tmforum.org/a2aproject/telecommunication/extensions/Authorization-T/v1',
  'Negotiation-T': 'https://projects.tmforum.org/a2aproject/telecommunication/extensions/Negotiation-T/v1',
}

export function buildExampleRequest(templateUri) {
  const metadata = { templateUri }
  if (!templateUri.startsWith('Negotiation-T')) {
    metadata[EXTENSION_URIS[templateUri.split('/')[0]]] = '<在此粘贴 A2A-T 渲染后的 prompt 文本>'
  }
  return {
    message: {
      messageId: crypto.randomUUID(),
      role: 'ROLE_USER',
      parts: [{ text: 'debug request' }],
      metadata,
    },
  }
}
```

- [ ] **Step 5: 写 `src/api.js`（含 DEV mock 兜底）**

```js
const TOKEN_KEY = 'openan-debug-token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function realFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const resp = await fetch(path, { ...options, headers })
  const text = await resp.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!resp.ok) {
    if (resp.status === 401 && getToken()) {
      setToken('')
      window.location.href = '/debug/'
    }
    const detail = body && body.detail ? (typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)) : `HTTP ${resp.status}`
    throw new ApiError(resp.status, detail)
  }
  return body
}

export async function apiFetch(path, options) {
  try {
    return await realFetch(path, options)
  } catch (error) {
    if (error instanceof ApiError) throw error
    const { mockApi } = await import('./mock')
    return mockApi(path, options)
  }
}

export const api = {
  get: (path) => apiFetch(path),
  post: (path, json) => apiFetch(path, { method: 'POST', body: JSON.stringify(json) }),
  patch: (path, json) => apiFetch(path, { method: 'PATCH', body: JSON.stringify(json) }),
  del: (path) => apiFetch(path, { method: 'DELETE' }),
}
```

- [ ] **Step 6: 写 `src/mock.js`（DEV 网络失败时的兜底数据）**

```js
const now = () => new Date().toISOString()
const seed = {
  id: 1,
  templateUri: 'Notification-T/network-layer/subscribe-incident/v1',
  name: '订阅事件样本（mock）',
  description: '内置演示数据',
  createdBy: 'mock',
  variantCount: 1,
  seedJson: { 'faultManagement.Incident': { csn: 'INC-001', priority: 'critical' } },
}

const fixtures = {
  'POST /api/v1/auth/login': () => ({ token: 'mock-token', username: 'admin', role: 'admin' }),
  'GET /api/v1/auth/me': () => ({ username: 'admin', role: 'admin' }),
  'GET /api/v1/seeds': () => [seed],
  'POST /api/v1/seeds': () => ({ ...seed, id: 2 }),
  'GET /api/v1/variants': () => [
    { id: 1, seedId: 1, templateUri: seed.templateUri, variantJson: seed.seedJson, enabled: true, source: 'import', seq: 0 },
  ],
  'GET /api/v1/history': () => ({
    total: 1,
    items: [
      {
        id: 1,
        templateUri: seed.templateUri,
        direction: 'console',
        taskState: 'TASK_STATE_COMPLETED',
        negotiated: false,
        latencyMs: 12,
        createdAt: now(),
        requestBody: {},
        responseBody: {},
      },
    ],
  }),
  'GET /api/v1/users': () => [{ id: 1, username: 'admin', role: 'admin', enabled: true }],
  'POST /api/v1/console/send': () => ({
    status: 200,
    latencyMs: 9,
    response: { task: { id: 'mock', status: { state: 'TASK_STATE_COMPLETED' } } },
  }),
}

export async function mockApi(path, options = {}) {
  await new Promise((resolve) => setTimeout(resolve, 100))
  const key = `${options.method || 'GET'} ${path.split('?')[0]}`
  const fixture = fixtures[key]
  if (fixture) return fixture()
  throw new Error(`no mock for ${key}`)
}
```

- [ ] **Step 7: 写 `src/styles.css`**

```css
* { box-sizing: border-box; margin: 0; }
body { font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif; background: #0f1420; color: #d8dee9; font-size: 14px; }
#root { min-height: 100vh; }
.layout { display: flex; min-height: 100vh; }
.sidebar { width: 200px; background: #131a2b; padding: 16px 0; flex-shrink: 0; }
.sidebar .brand { font-weight: 700; color: #4da3ff; padding: 0 20px 16px; letter-spacing: 1px; }
.sidebar a { display: block; padding: 10px 20px; color: #93a4bf; text-decoration: none; }
.sidebar a.active, .sidebar a:hover { background: #1c2740; color: #fff; }
.content { flex: 1; padding: 24px 28px; overflow: auto; }
.card { background: #161e30; border: 1px solid #232f4a; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
h2 { font-size: 16px; margin-bottom: 12px; color: #fff; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #232f4a; word-break: break-all; }
th { color: #7f93b5; font-weight: 500; }
button { background: #2563eb; border: none; color: #fff; padding: 7px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; }
button:hover { background: #1d4fd7; }
button.ghost { background: transparent; border: 1px solid #35476e; color: #9fb2d4; }
button.danger { background: #7f1d1d; }
input, select, textarea { background: #0f1626; border: 1px solid #2b3a5c; color: #d8dee9; border-radius: 6px; padding: 7px 10px; font-size: 13px; }
textarea { width: 100%; font-family: Consolas, monospace; }
.login-page { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
.login-box { width: 340px; }
.login-box input { width: 100%; margin-bottom: 12px; }
.login-box button { width: 100%; }
.error-text { color: #f87171; margin: 8px 0; }
.muted { color: #7f93b5; }
.tag { background: #1c2740; border-radius: 4px; padding: 2px 8px; font-size: 12px; margin-right: 6px; }
pre.json { background: #0b101d; border: 1px solid #232f4a; border-radius: 6px; padding: 12px; overflow: auto; max-height: 420px; font-size: 12px; }
.row { display: flex; gap: 12px; }
.row > * { flex: 1; }
.filters { display: flex; gap: 10px; margin-bottom: 12px; }
```

- [ ] **Step 8: 写 `src/main.jsx`、`src/App.jsx`、`src/pages/Login.jsx`**

`main.jsx`：
```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter basename="/debug">
    <App />
  </BrowserRouter>,
)
```

`App.jsx`：
```jsx
import { Navigate, Route, Routes } from 'react-router-dom'
import { getToken } from './api.js'
import ConsolePage from './pages/Console.jsx'
import HistoryPage from './pages/History.jsx'
import LoginPage from './pages/Login.jsx'
import SeedsPage from './pages/Seeds.jsx'
import UsersPage from './pages/Users.jsx'

function RequireAuth({ children }) {
  if (!getToken()) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RequireAuth><ConsolePage /></RequireAuth>} />
      <Route path="/seeds" element={<RequireAuth><SeedsPage /></RequireAuth>} />
      <Route path="/history" element={<RequireAuth><HistoryPage /></RequireAuth>} />
      <Route path="/users" element={<RequireAuth><UsersPage /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
```

`pages/Login.jsx`：
```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, setToken } from '../api.js'

export default function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setError('')
    try {
      const result = await api.post('/api/v1/auth/login', { username, password })
      setToken(result.token)
      navigate('/')
    } catch (err) {
      setError(err.message || '登录失败')
    }
  }

  return (
    <div className="login-page">
      <form className="login-box card" onSubmit={submit}>
        <h2>OpenAN-Debug 登录</h2>
        <input placeholder="用户名" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input placeholder="密码" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="error-text">{error}</div>}
        <button type="submit">登录</button>
      </form>
    </div>
  )
}
```

- [ ] **Step 9: 安装依赖并验证构建**

Run（workdir `frontend`）: `npm install; npm run build`
Expected: `dist/` 生成，无报错。

- [ ] **Step 10: Commit**

```bash
git add frontend
git commit -m "feat(frontend): vite react skeleton, api client with dev mock fallback, login page"
```

---

### Task 12: 前端调试台页（联调请求 → Response + 历史侧栏）

**Files:**
- Create: `frontend/src/pages/Console.jsx`

- [ ] **Step 1: 写 `src/pages/Console.jsx`**

```jsx
import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { TEMPLATE_URIS, buildExampleRequest } from '../templates.js'

export default function ConsolePage() {
  const [bodyText, setBodyText] = useState('')
  const [templateUri, setTemplateUri] = useState(TEMPLATE_URIS[2])
  const [response, setResponse] = useState(null)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [history, setHistory] = useState([])

  const loadHistory = useCallback(async () => {
    try {
      const result = await api.get('/api/v1/history?limit=20')
      setHistory(result.items || [])
    } catch {
      setHistory([])
    }
  }, [])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  function fillExample() {
    setBodyText(JSON.stringify(buildExampleRequest(templateUri), null, 2))
  }

  async function send() {
    setError('')
    setResponse(null)
    let parsed
    try {
      parsed = JSON.parse(bodyText)
    } catch (err) {
      setError(`请求 body 不是合法 JSON: ${err.message}`)
      return
    }
    setSending(true)
    try {
      const result = await api.post('/api/v1/console/send', { request: parsed, note: templateUri })
      setResponse(result)
      loadHistory()
    } catch (err) {
      setError(err.message || '发送失败')
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <h2>联调调试台</h2>
      <div className="row">
        <div className="card">
          <div className="filters">
            <select value={templateUri} onChange={(e) => setTemplateUri(e.target.value)}>
              {TEMPLATE_URIS.map((uri) => (
                <option key={uri} value={uri}>{uri}</option>
              ))}
            </select>
            <button className="ghost" onClick={fillExample}>填充示例请求</button>
            <button onClick={send} disabled={sending}>{sending ? '发送中...' : '发送请求'}</button>
          </div>
          <textarea rows={18} value={bodyText} onChange={(e) => setBodyText(e.target.value)}
            placeholder='在此粘贴 A2A SendMessageRequest 请求 body (JSON)' />
          {error && <div className="error-text">{error}</div>}
        </div>
        <div className="card">
          <h2>Response</h2>
          {response ? (
            <pre className="json">{JSON.stringify(response, null, 2)}</pre>
          ) : (
            <div className="muted">尚未发送请求</div>
          )}
        </div>
      </div>
      <div className="card">
        <h2>最近请求</h2>
        <table>
          <thead>
            <tr><th>时间</th><th>来源</th><th>模板</th><th>状态</th><th>耗时</th></tr>
          </thead>
          <tbody>
            {history.map((item) => (
              <tr key={item.id}>
                <td>{item.createdAt}</td>
                <td><span className="tag">{item.direction}</span></td>
                <td>{item.templateUri || '-'}</td>
                <td>{item.taskState || '-'}</td>
                <td>{item.latencyMs != null ? `${item.latencyMs}ms` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

注意：`<h2>联调调试台</h2>` 下方页面使用 layout；为让侧栏导航生效，在 Task 14 一并引入 Layout 包装（本任务先独立可渲染）。为避免返工，直接在本文件顶部加 `import Layout from '../Layout.jsx'` 并用 `<Layout>` 包裹返回值——因此本任务同时创建 `src/Layout.jsx`：

```jsx
import { NavLink } from 'react-router-dom'
import { api, getToken, setToken } from './api.js'

export default function Layout({ children }) {
  let role = ''
  try {
    const payload = JSON.parse(atob(getToken().split('.')[1] || ''))
    role = payload.role || ''
  } catch {
    role = ''
  }
  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="brand">OpenAN-Debug</div>
        <NavLink to="/" end>调试台</NavLink>
        <NavLink to="/seeds">种子/变体</NavLink>
        <NavLink to="/history">请求历史</NavLink>
        {role === 'admin' && <NavLink to="/users">用户管理</NavLink>}
        <a
          href="#logout"
          onClick={(event) => {
            event.preventDefault()
            setToken('')
            window.location.href = '/debug/'
          }}
        >
          退出登录
        </a>
      </nav>
      <main className="content">{children}</main>
    </div>
  )
}
```

并把 Console.jsx 的返回值改为 `<Layout>...</Layout>`（`<div>` 包在最外层的内容部分）。Login 页不套 Layout。

- [ ] **Step 2: 构建验证**

Run（workdir `frontend`）: `npm run build`
Expected: 构建成功。

- [ ] **Step 3: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): debug console page with example filler, response view, recent history"
```

---

### Task 13: 前端种子/变体管理页

**Files:**
- Create: `frontend/src/pages/Seeds.jsx`

- [ ] **Step 1: 写 `src/pages/Seeds.jsx`**

```jsx
import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import Layout from '../Layout.jsx'
import { TEMPLATE_URIS } from '../templates.js'

const emptySeed = { name: '', templateUri: TEMPLATE_URIS[2], seedJson: '{\n  \n}', description: '' }

export default function SeedsPage() {
  const [seeds, setSeeds] = useState([])
  const [variants, setVariants] = useState([])
  const [draft, setDraft] = useState(emptySeed)
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')
  const [importSeedId, setImportSeedId] = useState('')
  const [importUri, setImportUri] = useState(TEMPLATE_URIS[2])
  const [importFile, setImportFile] = useState(null)

  const load = useCallback(async () => {
    try {
      setSeeds(await api.get('/api/v1/seeds'))
      setVariants(await api.get('/api/v1/variants'))
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function editSeed(seed) {
    setEditingId(seed.id)
    setDraft({ ...seed, seedJson: JSON.stringify(seed.seedJson, null, 2) })
  }

  async function saveSeed(event) {
    event.preventDefault()
    setError('')
    let seedJson
    try {
      seedJson = JSON.parse(draft.seedJson || '{}')
    } catch {
      setError('种子 JSON 不合法')
      return
    }
    const payload = {
      name: draft.name,
      templateUri: draft.templateUri,
      seedJson,
      description: draft.description || '',
    }
    try {
      if (editingId) await api.patch(`/api/v1/seeds/${editingId}`, payload)
      else await api.post('/api/v1/seeds', payload)
      setDraft(emptySeed)
      setEditingId(null)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function removeSeed(id) {
    if (!window.confirm('删除该种子？')) return
    await api.del(`/api/v1/seeds/${id}`)
    load()
  }

  async function importVariants(event) {
    event.preventDefault()
    setError('')
    if (!importFile) {
      setError('请选择 variants.json 文件')
      return
    }
    try {
      const parsed = JSON.parse(await importFile.text())
      const payload = {
        seedId: importSeedId ? Number(importSeedId) : null,
        templateUri: importUri,
        variants: parsed.variants || parsed,
      }
      const result = await api.post('/api/v1/variants/import', payload)
      alert(`导入成功：${result.imported} 条，起始 seq=${result.firstSeq}`)
      load()
    } catch (err) {
      setError(err.message || '导入失败')
    }
  }

  async function toggleVariant(variant) {
    await api.patch(`/api/v1/variants/${variant.id}`, { enabled: !variant.enabled })
    load()
  }

  return (
    <Layout>
      <h2>种子数据管理</h2>
      {error && <div className="error-text">{error}</div>}
      <div className="row">
        <div className="card">
          <h2>{editingId ? `编辑种子 #${editingId}` : '新建种子'}</h2>
          <form onSubmit={saveSeed}>
            <div className="filters">
              <input placeholder="名称" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <select value={draft.templateUri} onChange={(e) => setDraft({ ...draft, templateUri: e.target.value })}>
                {TEMPLATE_URIS.map((uri) => (<option key={uri} value={uri}>{uri}</option>))}
              </select>
            </div>
            <textarea rows={8} value={draft.seedJson} onChange={(e) => setDraft({ ...draft, seedJson: e.target.value })} />
            <div className="filters" style={{ marginTop: 10 }}>
              <input placeholder="描述" value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              <button type="submit">保存</button>
              {editingId && <button type="button" className="ghost" onClick={() => { setEditingId(null); setDraft(emptySeed) }}>取消</button>}
            </div>
          </form>
        </div>
        <div className="card">
          <h2>导入泛化变体</h2>
          <p className="muted">选择本地 tools/stub_generator 生成的 variants.json（格式：&#123;"templateUri", "variants": [..]&#125;）</p>
          <form onSubmit={importVariants}>
            <div className="filters">
              <select value={importSeedId} onChange={(e) => setImportSeedId(e.target.value)}>
                <option value="">不绑定种子</option>
                {seeds.map((seed) => (<option key={seed.id} value={seed.id}>{seed.name}</option>))}
              </select>
              <select value={importUri} onChange={(e) => setImportUri(e.target.value)}>
                {TEMPLATE_URIS.map((uri) => (<option key={uri} value={uri}>{uri}</option>))}
              </select>
            </div>
            <input type="file" accept=".json" onChange={(e) => setImportFile(e.target.files[0])} />
            <button type="submit" style={{ marginTop: 10 }}>导入</button>
          </form>
        </div>
      </div>
      <div className="card">
        <h2>种子列表</h2>
        <table>
          <thead><tr><th>ID</th><th>名称</th><th>模板</th><th>变体数</th><th>描述</th><th>操作</th></tr></thead>
          <tbody>
            {seeds.map((seed) => (
              <tr key={seed.id}>
                <td>{seed.id}</td>
                <td>{seed.name}</td>
                <td>{seed.templateUri}</td>
                <td>{seed.variantCount}</td>
                <td>{seed.description}</td>
                <td>
                  <button className="ghost" onClick={() => editSeed(seed)}>编辑</button>{' '}
                  <button className="danger" onClick={() => removeSeed(seed.id)}>删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2>变体池</h2>
        <table>
          <thead><tr><th>ID</th><th>seq</th><th>模板</th><th>内容</th><th>启用</th><th>来源</th></tr></thead>
          <tbody>
            {variants.map((variant) => (
              <tr key={variant.id}>
                <td>{variant.id}</td>
                <td>{variant.seq}</td>
                <td>{variant.templateUri}</td>
                <td><pre className="json" style={{ maxHeight: 120 }}>{JSON.stringify(variant.variantJson, null, 2)}</pre></td>
                <td><button className="ghost" onClick={() => toggleVariant(variant)}>{variant.enabled ? '停用' : '启用'}</button></td>
                <td>{variant.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  )
}
```

同时给 Console.jsx 补上 `import Layout from '../Layout.jsx'` 并用 `<Layout>` 包裹（Task 12 已说明，若未做则此时补齐）。

- [ ] **Step 2: 构建验证**

Run（workdir `frontend`）: `npm run build`
Expected: 构建成功。

- [ ] **Step 3: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): seeds and variants management page with import and toggle"
```

---

### Task 14: 前端历史页与用户管理页

**Files:**
- Create: `frontend/src/pages/History.jsx`, `frontend/src/pages/Users.jsx`

- [ ] **Step 1: 写 `src/pages/History.jsx`**

```jsx
import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import Layout from '../Layout.jsx'
import { TEMPLATE_URIS } from '../templates.js'

export default function HistoryPage() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [templateUri, setTemplateUri] = useState('')
  const [direction, setDirection] = useState('')
  const [state, setState] = useState('')
  const [detail, setDetail] = useState(null)

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    if (templateUri) params.set('templateUri', templateUri)
    if (direction) params.set('direction', direction)
    if (state) params.set('state', state)
    const result = await api.get(`/api/v1/history?${params.toString()}`)
    setItems(result.items)
    setTotal(result.total)
  }, [templateUri, direction, state])

  useEffect(() => {
    load().catch(() => {})
  }, [load])

  async function openDetail(id) {
    setDetail(await api.get(`/api/v1/history/${id}`))
  }

  return (
    <Layout>
      <h2>请求历史（共 {total} 条）</h2>
      <div className="filters">
        <select value={templateUri} onChange={(e) => setTemplateUri(e.target.value)}>
          <option value="">全部模板</option>
          {TEMPLATE_URIS.map((uri) => (<option key={uri} value={uri}>{uri}</option>))}
        </select>
        <select value={direction} onChange={(e) => setDirection(e.target.value)}>
          <option value="">全部来源</option>
          <option value="inbound">inbound（联调）</option>
          <option value="console">console（调试台）</option>
        </select>
        <select value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">全部状态</option>
          <option value="TASK_STATE_COMPLETED">COMPLETED</option>
          <option value="TASK_STATE_REJECTED">REJECTED</option>
          <option value="TASK_STATE_INPUT_REQUIRED">INPUT_REQUIRED</option>
          <option value="TASK_STATE_FAILED">FAILED</option>
          <option value="TASK_STATE_CANCELED">CANCELED</option>
        </select>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>ID</th><th>时间</th><th>来源</th><th>模板</th><th>状态</th><th>协商</th><th>耗时</th><th>操作</th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.id}</td>
                <td>{item.createdAt}</td>
                <td>{item.direction}</td>
                <td>{item.templateUri || '-'}</td>
                <td>{item.taskState || '-'}</td>
                <td>{item.negotiated ? '是' : '否'}</td>
                <td>{item.latencyMs != null ? `${item.latencyMs}ms` : '-'}</td>
                <td><button className="ghost" onClick={() => openDetail(item.id)}>详情</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detail && (
        <div className="card">
          <h2>详情 #{detail.id} <button className="ghost" onClick={() => setDetail(null)}>关闭</button></h2>
          <h2>请求</h2>
          <pre className="json">{JSON.stringify(detail.requestBody, null, 2)}</pre>
          <h2>响应</h2>
          <pre className="json">{JSON.stringify(detail.responseBody, null, 2)}</pre>
        </div>
      )}
    </Layout>
  )
}
```

- [ ] **Step 2: 写 `src/pages/Users.jsx`**

```jsx
import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import Layout from '../Layout.jsx'

export default function UsersPage() {
  const [users, setUsers] = useState([])
  const [draft, setDraft] = useState({ username: '', password: '', role: 'user' })
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setUsers(await api.get('/api/v1/users'))
  }, [])

  useEffect(() => {
    load().catch((err) => setError(err.message))
  }, [load])

  async function create(event) {
    event.preventDefault()
    setError('')
    try {
      await api.post('/api/v1/users', draft)
      setDraft({ username: '', password: '', role: 'user' })
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function toggle(user) {
    await api.patch(`/api/v1/users/${user.id}`, { enabled: !user.enabled })
    load()
  }

  return (
    <Layout>
      <h2>用户管理</h2>
      {error && <div className="error-text">{error}</div>}
      <div className="card">
        <h2>新建用户</h2>
        <form className="filters" onSubmit={create}>
          <input placeholder="用户名" value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} />
          <input placeholder="密码（>=8位）" type="password" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} />
          <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          <button type="submit">创建</button>
        </form>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>ID</th><th>用户名</th><th>角色</th><th>启用</th><th>操作</th></tr></thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.id}</td>
                <td>{user.username}</td>
                <td>{user.role}</td>
                <td>{user.enabled ? '是' : '否'}</td>
                <td><button className="ghost" onClick={() => toggle(user)}>{user.enabled ? '禁用' : '启用'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  )
}
```

- [ ] **Step 3: 构建验证 + 手工冒烟（联调后端）**

Run（workdir `frontend`）: `npm run build`
Run（workdir `server`）: `uv run uvicorn openan_debug.main:app --port 9000`（后台）
Run（workdir `frontend`）: `npm run dev` 后浏览器打开 `http://localhost:5180/debug/`
Expected: 登录 admin/admin-pass-01 成功（本地 .env 有 OPENAN_DEBUG_ADMIN_PASSWORD 时）或首次启动 stderr 打印的密码；调试台发送示例请求返回 Response（降级模式）；种子页 CRUD 正常。验证后停止进程。

- [ ] **Step 4: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): request history page with filters/detail and admin user management"
```

---

### Task 15: 部署物（systemd、Nginx、部署脚本、README）

**Files:**
- Create: `deploy/openan-debug.service`, `deploy/nginx-locations.conf`, `deploy/remote_nginx_insert.py`, `deploy/server.env.template`, `deploy/deploy.py`, `deploy/verify_remote_e2e.py`, `README.md`

- [ ] **Step 1: 写 `deploy/openan-debug.service`**

```ini
[Unit]
Description=OpenAN-Debug (A2A-T mock agent + debug API)
After=network.target

[Service]
Type=simple
WorkingDirectory=/OpenA2A-T/openan-debug/server
ExecStart=/OpenA2A-T/openan-debug/server/.venv/bin/uvicorn openan_debug.main:app --host 127.0.0.1 --port 9000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: 写 `deploy/nginx-locations.conf`**

```nginx
        # openan-debug begin
        location /debug/api/ {
            proxy_pass http://127.0.0.1:9000/api/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
        location /debug/a2a/ {
            proxy_pass http://127.0.0.1:9000/debug/a2a/;
            proxy_http_version 1.1;
            proxy_buffering off;
            proxy_read_timeout 300s;
            proxy_set_header Host $host;
        }
        location /debug/ {
            alias /OpenA2A-T/openan-debug-frontend/;
            try_files $uri $uri/ /debug/index.html;
        }
        # openan-debug end
```

- [ ] **Step 3: 写 `deploy/remote_nginx_insert.py`（在服务器上执行，幂等）**

```python
import sys
from pathlib import Path

MARKER_BEGIN = "# openan-debug begin"
SNIPPET = Path("/OpenA2A-T/openan-debug/deploy/nginx-locations.conf").read_text(encoding="utf-8")


def find_config_file():
    import subprocess

    result = subprocess.run(
        ["grep", "-rl", "OpenA2A-T/website", "/etc/nginx/"],
        capture_output=True, text=True,
    )
    candidates = [line for line in result.stdout.splitlines() if line.strip()]
    if not candidates:
        result = subprocess.run(
            ["grep", "-rl", "location /", "/etc/nginx/conf.d/", "/etc/nginx/nginx.conf"],
            capture_output=True, text=True,
        )
        candidates = [line for line in result.stdout.splitlines() if line.strip()]
    if not candidates:
        print("no nginx config file found referencing the website root", file=sys.stderr)
        sys.exit(1)
    return candidates[0]


def insert_before_server_close(content: str) -> str:
    if MARKER_BEGIN in content:
        print("openan-debug locations already present, skip")
        return content
    depth = 0
    server_start = None
    closing_index = None
    for index, char in enumerate(content):
        if char == "{":
            if depth == 0:
                server_start = index
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0 and server_start is not None and "server" in content[max(0, server_start - 200):server_start]:
                if "listen" in content[server_start:index]:
                    closing_index = index
                    break
            if depth == 0:
                server_start = None
    if closing_index is None:
        print("no server block found", file=sys.stderr)
        sys.exit(1)
    return content[:closing_index] + "\n" + SNIPPET + "\n" + content[closing_index:]


config_path = Path(find_config_file())
original = config_path.read_text(encoding="utf-8")
config_path.write_text(insert_before_server_close(original), encoding="utf-8")
print(f"updated {config_path}")
```

- [ ] **Step 4: 写 `deploy/server.env.template`**

```ini
A2AT_LLM_PROVIDER=openai
A2AT_LLM_MODEL=qwen-plus
A2AT_LLM_API_KEY=
A2AT_LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
A2AT_LLM_MAX_ATTEMPTS=2
A2AT_LANGUAGE=zh-CN
OPENAN_DEBUG_HOST=127.0.0.1
OPENAN_DEBUG_PORT=9000
OPENAN_DEBUG_DB_PATH=data/openan-debug.db
OPENAN_DEBUG_JWT_SECRET=请替换为随机串
OPENAN_DEBUG_ADMIN_PASSWORD=
OPENAN_DEBUG_PUBLIC_URL=http://47.120.10.111/debug/a2a
OPENAN_DEBUG_AGENT_INTERNAL_URL=http://127.0.0.1:9000/debug/a2a/message:send
OPENAN_DEBUG_STUB_FALLBACK=on
```

- [ ] **Step 5: 写 `deploy/deploy.py`**

```python
import getpass
import glob
import os
import stat
import tarfile
import tempfile
from pathlib import Path

import paramiko

HOST = "47.120.10.111"
USER = "root"
PROJECT = Path(__file__).resolve().parent.parent
SERVER_DIR = PROJECT / "server"
FRONTEND_DIST = PROJECT / "frontend" / "dist"
REMOTE_BASE = "/OpenA2A-T/openan-debug"
REMOTE_FRONTEND = "/OpenA2A-T/openan-debug-frontend"


def make_tar(source_dir: Path, exclusions, out_path: Path):
    with tarfile.open(out_path, "w:gz") as tar:
        for item in source_dir.rglob("*"):
            rel = item.relative_to(source_dir)
            if any(part in exclusions for part in rel.parts):
                continue
            tar.add(item, arcname=str(rel))


def run(ssh, command, check=True):
    stdin, stdout, stderr = ssh.exec_command(command, timeout=600)
    code = stdout.channel.recv_exit_status()
    out = stdout.read().decode()
    err = stderr.read().decode()
    print(f"$ {command}\n{out}{err}")
    if check and code != 0:
        raise SystemExit(f"command failed ({code}): {command}")
    return out


def main():
    password = os.environ.get("DEPLOY_PASSWORD") or getpass.getpass(f"password for {USER}@{HOST}: ")
    wheels_dir = PROJECT / "deploy" / "wheels"
    wheels_dir.mkdir(parents=True, exist_ok=True)
    print("building a2a-t-sdk wheel ...")
    os.system(f'uv build --wheel --out-dir "{wheels_dir}" "{PROJECT.parent / "a2a-t-sdk-python"}"')
    wheel_files = glob.glob(str(wheels_dir / "a2a_t_sdk-*.whl"))
    if not wheel_files:
        raise SystemExit("a2a_t wheel build failed; cannot continue")
    if not FRONTEND_DIST.exists():
        raise SystemExit("frontend/dist missing; run `npm run build` in frontend/ first")

    with tempfile.TemporaryDirectory() as tmp:
        server_tar = Path(tmp) / "server.tgz"
        frontend_tar = Path(tmp) / "frontend.tgz"
        make_tar(SERVER_DIR, {".venv", "__pycache__", "data", ".pytest_cache"}, server_tar)
        make_tar(FRONTEND_DIST, set(), frontend_tar)

        transport = paramiko.Transport((HOST, 22))
        transport.connect(username=USER, password=password)
        sftp = paramiko.SFTPClient.from_transport(transport)
        for local, remote in [
            (server_tar, f"{REMOTE_BASE}/server.tgz"),
            (frontend_tar, f"{REMOTE_BASE}/frontend.tgz"),
            *[(wheel, f"{REMOTE_BASE}/wheels/{Path(wheel).name}") for wheel in wheel_files],
            (PROJECT / "deploy" / "openan-debug.service", "/etc/systemd/system/openan-debug.service"),
            (PROJECT / "deploy" / "server.env.template", f"{REMOTE_BASE}/deploy/server.env.template"),
            (PROJECT / "deploy" / "nginx-locations.conf", f"{REMOTE_BASE}/deploy/nginx-locations.conf"),
            (PROJECT / "deploy" / "remote_nginx_insert.py", f"{REMOTE_BASE}/deploy/remote_nginx_insert.py"),
        ]:
            remote_dir = os.path.dirname(remote)
            run(ssh_dummy := None, f"echo", check=False) if False else None
            _ensure_remote_dir(sftp, remote_dir)
            print(f"upload {local} -> {remote}")
            sftp.put(str(local), remote)
        sftp.close()
        transport.close()

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, 22, USER, password, allow_agent=False, look_for_keys=False)
    run(ssh, f"mkdir -p {REMOTE_BASE}/wheels {REMOTE_BASE}/deploy {REMOTE_FRONTEND}")
    run(ssh, f"cd {REMOTE_BASE} && tar xzf server.tgz -C server || (mkdir -p server && tar xzf server.tgz -C server)")
    run(ssh, f"cd {REMOTE_BASE} && tar xzf frontend.tgz -C {REMOTE_FRONTEND}")
    run(ssh, "test -f ~/.local/bin/uv || (curl -LsSf https://astral.sh/uv/install.sh | sh)", check=False)
    run(ssh, f"cd {REMOTE_BASE}/server && ~/.local/bin/uv venv .venv --python 3.12", check=False)
    run(
        ssh,
        f"cd {REMOTE_BASE}/server && ~/.local/bin/uv pip install --python .venv/bin/python "
        f"-r requirements.txt {REMOTE_BASE}/wheels/a2a_t_sdk-*.whl",
    )
    run(ssh, f"test -f {REMOTE_BASE}/server/.env || cp {REMOTE_BASE}/deploy/server.env.template {REMOTE_BASE}/server/.env")
    run(ssh, f"python3 {REMOTE_BASE}/deploy/remote_nginx_insert.py")
    run(ssh, "nginx -t && systemctl reload nginx")
    run(ssh, "systemctl daemon-reload && systemctl enable openan-debug && systemctl restart openan-debug")
    run(ssh, "sleep 3 && curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:9000/api/v1/health")
    run(ssh, "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/debug/")
    run(ssh, "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/debug/a2a/.well-known/agent-card.json")
    run(ssh, "journalctl -u openan-debug -n 5 --no-pager | grep -o 'password: .*' || true")
    ssh.close()
    print("deploy done: http://47.120.10.111/debug/")


def _ensure_remote_dir(sftp, remote_dir):
    parts = [p for p in remote_dir.split("/") if p]
    current = ""
    for part in parts:
        current += "/" + part
        try:
            sftp.stat(current)
        except FileNotFoundError:
            sftp.mkdir(current)


if __name__ == "__main__":
    main()
```

修正说明（实施时直接采用）：删除 `run(ssh_dummy := None, ...)` 那行无用残留；`tar xzf server.tgz -C server` 前先 `mkdir -p server`，改为：

```python
    run(ssh, f"mkdir -p {REMOTE_BASE}/server && cd {REMOTE_BASE} && tar xzf server.tgz -C server")
```

- [ ] **Step 6: 写 `deploy/verify_remote_e2e.py`（本机运行，验证公网 Mock Agent）**

```python
import asyncio
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))

import httpx
from a2a.client.client import ClientConfig, ClientCallContext
from a2a.client.client_factory import ClientFactory
from a2a.types import AgentCard, TransportProtocol
from a2a_t.client.a2at_client import A2ATClient
from a2a_t.common.prompt_resources.resource_access import PackagedPromptResourceAccess
from a2a_t.core.metadata import NOTIFICATION_T_EXTENSION_URI
from a2a_t.core.standard_templates import SUBSCRIBE_INCIDENT_URI
from google.protobuf.json_format import MessageToDict, ParseDict

BASE_URL = "http://47.120.10.111/debug/a2a"
ENV_PATH = Path(__file__).resolve().parent.parent / "server" / ".env"


async def main() -> int:
    prompt_client = A2ATClient(env_path=ENV_PATH if ENV_PATH.exists() else None)
    schema = PackagedPromptResourceAccess().slot_schema(SUBSCRIBE_INCIDENT_URI, "zh-CN")
    data = {
        "通知主题": "Incident",
        "订阅条件": "故障优先级为：严重、高。故障名称为：光纤中断。",
        "上报通知数据格式": "通过DataPart上报Incident数据。",
    }
    metadata = prompt_client.generate_task_prompt_from_data_with_schema(
        data, schema, SUBSCRIBE_INCIDENT_URI
    ).build_metadata_content()
    request = ParseDict(
        {
            "message": {
                "messageId": str(uuid.uuid4()),
                "role": "ROLE_USER",
                "parts": [{"text": "subscribe incident"}],
                "metadata": metadata,
            }
        },
        __import__("a2a.types", fromlist=["SendMessageRequest"]).SendMessageRequest(),
    )
    async with httpx.AsyncClient(timeout=60, trust_env=False) as httpx_client:
        card_resp = await httpx_client.get(f"{BASE_URL}/.well-known/agent-card.json")
        card_resp.raise_for_status()
        agent_card = ParseDict(card_resp.json(), AgentCard())
        factory = ClientFactory(
            ClientConfig(
                httpx_client=httpx_client,
                supported_protocol_bindings=[TransportProtocol.HTTP_JSON],
                use_client_preference=True,
            )
        )
        client = factory.create(agent_card)
        call_context = ClientCallContext(
            state={}, timeout=None, service_parameters={"A2A-Extensions": NOTIFICATION_T_EXTENSION_URI}
        )
        saw_artifact = False
        async for response in client.send_message(request, context=call_context):
            for field_name in ("status_update", "message", "artifact_update", "task"):
                child = getattr(response, field_name, None)
                if child is not None and hasattr(child, "SerializeToString"):
                    text = MessageToDict(child)
                    if "faultManagement.Incident" in str(text):
                        saw_artifact = True
                    print(field_name, str(text)[:200])
    print("STUB ARTIFACT RECEIVED" if saw_artifact else "NO ARTIFACT")
    return 0 if saw_artifact else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
```

- [ ] **Step 7: 写 `README.md`（项目根）**

```markdown
# OpenAN-Debug

OpenAN 对接联调系统：A2A-T Mock Agent（完整协议流程 + 打桩数据）+ 调试 Web（登录/种子变体管理/联调调试台/请求历史）。

## 结构

- `server/`：FastAPI 单体（Debug API `/api/v1/*` + Mock Agent `/debug/a2a/*`），SQLite。
- `frontend/`：React + Vite，构建后部署 `/OpenA2A-T/openan-debug-frontend`，访问路径 `/debug/`。
- `tools/stub_generator/`：本地 LLM 泛化 CLI（种子 → 变体 JSON）。
- `deploy/`：阿里云 47.120.10.111 部署脚本与配置。

## 本地开发

cd server && uv sync && uv run pytest
cd server && OPENAN_DEBUG_ADMIN_PASSWORD=admin-pass-01 uv run uvicorn openan_debug.main:app --port 9000
cd frontend && npm install && npm run dev    # http://localhost:5180/debug/

## 打桩数据流

1. 页面上传种子（或 API `POST /api/v1/seeds`）。
2. 本地：`python tools/stub_generator/cli.py --seed seed.json --template-uri ... --count 5 --base-url ... --api-key ... --model ...`
3. 页面"导入泛化变体"上传 variants.json。

## 联调

- Mock Agent 卡片：`http://47.120.10.111/debug/a2a/.well-known/agent-card.json`
- 请求端点：`POST http://47.120.10.111/debug/a2a/message:send`（HTTP+JSON binding）
- OpenAN 侧把 AgentCard `supportedInterfaces[0].url` 指向上址，或注册进 registry-center。
- 服务器 `.env` 配好 `A2AT_LLM_*` 后启用完整协议（协商分支）；未配置时自动降级直接打桩。

## 部署

cd frontend && npm run build
python deploy/deploy.py     # 打包上传 + 远端 uv 安装 + systemd + nginx + 健康检查
python deploy/verify_remote_e2e.py
```

- [ ] **Step 8: Commit**

```bash
git add deploy README.md
git commit -m "feat(deploy): systemd unit, nginx snippet, paramiko deploy script, remote e2e verifier"
```

---

### Task 16: 执行部署与验收

**Files:** 无新文件（执行 + 修正）

- [ ] **Step 1: 本地全量回归**

Run（workdir `server`）: `uv run pytest -v`
Expected: 全部 passed

Run（workdir `frontend`）: `npm run build`
Expected: 成功产出 dist/

- [ ] **Step 2: 执行部署**

Run: `python deploy/deploy.py`（提示输入服务器密码；也可 `DEPLOY_PASSWORD=...`）
Expected: 末尾健康检查输出 `200`（health、/debug/、agent-card 三项）；journalctl 打印 bootstrap admin 密码（记下来交给需求方）。

- [ ] **Step 3: 远端 .env 配置确认**

SSH 到服务器确认 `/OpenA2A-T/openan-debug/server/.env`：
- `OPENAN_DEBUG_JWT_SECRET` 已替换为随机串
- `A2AT_LLM_API_KEY` 视需求方提供情况填写（不填则运行在降级打桩模式）
- 修改后 `systemctl restart openan-debug`

- [ ] **Step 4: 公网端到端验收**

Run（本机）: `python deploy/verify_remote_e2e.py`
Expected: 输出事件流且末尾 `STUB ARTIFACT RECEIVED`（若服务器未配 LLM，走降级打桩，同样应收到 Artifact）。

- [ ] **Step 5: 浏览器验收**

打开 `http://47.120.10.111/debug/`：
- 登录（bootstrap admin 密码）
- 调试台"填充示例请求"→ 发送 → 看到 Response
- 种子页导入一份 variants.json、启停变体
- 历史页能筛选并查看 console/inbound 记录
Expected: 全部可用。

- [ ] **Step 6: 重启恢复验收**

SSH: `systemctl restart openan-debug && sleep 3 && curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:9000/api/v1/health`
再模拟整机重启或 `systemctl reboot` 后重复 Step 4 的 curl 检查。
Expected: `200`；变体数据仍在（SQLite 持久化）。

- [ ] **Step 7: 验收记录提交**

```bash
git add -A
git commit -m "chore: deployment acceptance notes" --allow-empty -m "acceptance: pytest green, remote e2e stub artifact received, web verified, restart recovery ok"
```

---

## 计划自审记录

1. **规格覆盖**：Mock Agent 完整协议流程（Task 5/6）；变体占位符回填（Task 4/5）；协商 propose/accept/reject/abort（Task 5 测试覆盖 REJECT/ABORT/INPUT_REQUIRED/轮次耗尽，accept 轮次由客户端重发已填参数的 Task-T prompt 后走同一流程）；种子/变体管理与页面导入（Task 7/13）；调试台 body→Response+历史（Task 8/12）；请求历史（Task 8/14）；JWT 登录+用户管理（Task 3/11/14）；本地泛化 CLI（Task 10）；部署与验收（Task 15/16）。规格中"管理员建号"（Task 3 users_router）、"响应头回显 A2A-Extensions"（Task 6 中间件）、"AgentCard 端点"（Task 6）均有对应任务。无遗漏。
2. **占位符扫描**：无 TBD/TODO；两处"修正说明"段落是对初稿代码的明确替换指令，实施者按修正后写法落盘。
3. **类型一致性**：`pick_variant(session, agent_id, template_uri, cursor)`（Task 4 定义，Task 5/6 引用一致）；`FlowRequest/FlowResult` 字段（Task 5 定义，Task 6 executor 引用一致）；`Settings` 字段（Task 1 定义，conftest/flow_env/main 引用一致）；`build_agent_card_payload(public_url)`（Task 6 定义，Task 9/15 引用一致）；variants 导入返回 `{imported, firstSeq, ids}` 与前端断言一致。
4. **风险与回退**：a2a-sdk 1.1.0 拉取失败 → 1.1.2（导入面一致）；uv 远端不可用 → 用 `python3 -m venv` + `pip install` 等价替换；`ClientCallContext` 构造签名差异 → 按字段别名调整（Task 9 已注明）。

## 执行提示

- 每个 Task 结束必须跑对应测试命令并把输出贴进执行记录，再 commit。
- Task 5 的 FakeServer 测试是纯逻辑测试，禁止为通过测试而改动协议分支语义。
- 遇到 SDK 行为与本计划"必读事实"冲突时，以源码为准并在执行记录中标注偏差。


