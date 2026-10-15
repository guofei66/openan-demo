# MockAgent — A2A-T 打桩智能体服务 / A2A-T Mock Agent Service

> 同步自 [project-openan/openan-debug](https://github.com/project-openan/openan-debug) 的 MockAgent 代码（服务端 + 配置 + 数据集 + 工作流 + 调测台前端）。
> Synced from the MockAgent code of [project-openan/openan-debug](https://github.com/project-openan/openan-debug) (backend + config + datasets + workflows + debug-console frontend).

## 一、概述 / Overview

**中文**：MockAgent 是基于 A2A-T SDK 的智能体打桩与调测服务。它提供三类能力：

1. **打桩实例**：每个 Agent 是 `agents/<id>/` 下的一个独立目录（`agent.json` 配置 + `agent.py` 差异化代码），共 6 个实例（故障诊断 / 业务抢通 / 节能降碳 / 无线域 / 直播 / 业务保障），每个实例挂载标准 A2A-T 端点（AgentCard、message:send、tasks:subscribe 等），可被编排中心或其它智能体真实调用。
2. **数据集关联与检索**：16 个 Task-T/Notification-T 模板、6060 组「请求-响应」成对样本（`expanded_dataset.json`）；每个实例按 `datasetTemplates` 绑定模板范围，请求按模板过滤 + 相似度评分（标识回填）命中唯一数据对，保证**请求-响应成对匹配**，并在响应 metadata 中携带匹配溯源（`openan.datasetMatch`）。
3. **三种回包模式**（优先级从高到低）：
   - **工作流编排模式**（`workflow.enabled`）：实例作为工作流宿主，基于 [workflow-engine-sdk-python](https://github.com/project-openan/workflow-engine-sdk-python) 执行内置 PSOP；SELF_LOOP 步骤本地生成，普通步骤经 A2ATransport 派发到其它打桩实例（远端实例按数据集检索回包），执行事件全程留痕。
   - **LLM 生成模式**（`llm.enabled`）：调用 OpenAI 兼容接口按数据集样例格式生成响应；失败自动回落。
   - **数据集匹配模式**：直接检索关联数据集返回成对响应；未命中回退变体池基线。

**English**: MockAgent is a stubbing & debugging service for A2A-T agents. It provides:

1. **Stub instances**: 6 standalone FastAPI agents (fault diagnosis / service recovery / energy saving / wireless domain / live stream / service assurance), one directory per agent under `agents/<id>/` (`agent.json` config + `agent.py` code extending the engine base class), each mounting standard A2A-T endpoints (AgentCard, message:send, tasks:subscribe, ...).
2. **Dataset binding & retrieval**: 16 Task-T/Notification-T templates with 6060 request-response pairs (`expanded_dataset.json`); each instance is scoped by `datasetTemplates`, requests are matched per template with similarity scoring (identifier backfill), guaranteeing **paired request-response matching** with provenance metadata (`openan.datasetMatch`).
3. **Three reply modes** (priority high → low):
   - **Workflow mode** (`workflow.enabled`): the instance hosts a built-in PSOP workflow via [workflow-engine-sdk-python](https://github.com/project-openan/workflow-engine-sdk-python); SELF_LOOP steps run locally, normal steps are dispatched over A2ATransport to sibling stub instances (which reply via dataset retrieval), with full event tracing.
   - **LLM mode** (`llm.enabled`): generates responses via an OpenAI-compatible endpoint anchored to dataset samples; falls back automatically on failure.
   - **Dataset mode**: returns the retrieved paired response directly; falls back to the variant-pool baseline when unmatched.

## 二、目录结构 / Directory Layout

```
mockagent/                                # 独立项目根 / standalone project root
├── agents/                               # 每个 Agent 一个独立目录（配置 + 代码）/ one directory per agent (config + code)
│   ├── _defaults.json                    # 共享基线（llm 默认、12 模板变体池、workDirRoot）
│   ├── fault-diagnosis-stub/             # 故障诊断 Agent（9005）：agent.json + agent.py
│   ├── recovery-stub/                    # 业务抢通 Agent（9006）：agent.json + agent.py
│   ├── energy-saving-stub/               # 节能降碳 Agent（9007）：agent.json + agent.py
│   ├── wireless-domain-stub/             # 无线域 Agent（9008）：agent.json + agent.py
│   ├── livestream-stub/                  # 直播 Agent（9009）：agent.json + agent.py
│   └── service-assurance-stub/           # 业务保障 Agent（9010，工作流宿主）：agent.json + agent.py
├── datasets/                             # 请求-响应成对数据集
│   ├── expanded_dataset.json             # 16 模板 6060 组
│   ├── demo_dataset.json                 # 种子数据集
│   └── trace_examples.json               # 调用链示例
├── scenarios/                              # 场景目录：一个场景一个目录（故事线 + PSOP + 智能体清单）
│   └── live-assurance-demo/
│       ├── scenario.json                   # 故事线描述（背景/角色/阶段/预期结果）
│       ├── workflow.json                   # 本场景的 PSOP 工作流文件
│       └── agents.json                     # 场景需要的智能体清单（引用 agents/<id>/，含角色）
├── requirements.txt                      # Python 依赖（a2a-sdk / a2a-t-sdk / workflow-exec-engine ...）
├── pyproject.toml / .env.example
├── mockagent_engine/                       # 引擎包 / engine package（服务运行时，Agent 定义在 agents/）
│   ├── main.py                           # 调测台后端入口（REST + JWT）
│   ├── agent_registry.py                 # agents/ 目录扫描与聚合
│   ├── scenario_registry.py              # scenarios/ 场景加载（故事线 + 工作流 + 智能体清单）
│   ├── standalone_agent.py               # 独立打桩实例入口（python -m mockagent_engine.standalone_agent --agent <id>）
│   ├── protocol_flow.py                  # A2A-T 协议流（意图/授权/协商/任务）
│   ├── dataset_retrieval.py              # 数据集检索（模板过滤 + 评分 + 标识回填）
│   ├── llm_client.py                     # LLM 生成模式
│   ├── workflow_mode.py                  # 工作流编排模式（workflow-engine-sdk）
│   ├── agent/                            # 实例运行时（A2A app / AgentCard / 执行器）
│   ├── routers/                          # 调测台 REST 路由（实例管理/数据集/历史/变体/控制台...）
│   └── data/registry_samples/            # 编排中心样例 PSOP
└── frontend/                             # React 调测台（MockAgent 管理 / 数据集 / 控制台）
```

> 命名说明 / Naming：`mockagent/` 是项目根，`mockagent_engine/` 是引擎代码包（Python 导入名不含连字符），`agents/` 是 Agent 定义目录——三者职责互不重叠。
> `mockagent/` is the project root, `mockagent_engine/` is the engine package (Python imports cannot contain hyphens), and `agents/` holds the agent definitions.

**场景目录 / Scenario directories**：每个场景一个目录（`scenarios/<id>/`），打包三类配置，缺一不可——`scenario.json` 故事线描述（背景/角色/阶段/预期结果，中英名称）、`workflow.json` 本场景的 PSOP 工作流、`agents.json` 场景需要的智能体清单（引用 `agents/<id>/` 定义并声明角色 workflow-host/participant，引用不存在的 Agent 会被拒绝）。工作流按 id 两级查找：全局 `workflows/` → 场景目录；场景接口：`GET /api/v1/scenarios`（列表）、`GET /api/v1/scenarios/{id}`（详情含故事线与智能体）。

**Agent 目录内容 / What's inside an agent directory**：`agent.json` 声明该 Agent 的名称、端口、提示词变体（stubVariants）、数据集模板范围（datasetTemplates）、LLM 与工作流配置；共享基线在 `agents/_defaults.json`。
**Agent 代码 / Agent code**：`agent.py` 定义继承引擎基类 `mockagent_engine.agent.base.StubAgentBase` 的子类，承载差异化能力（如域内意图→模板推断）。引擎在桩选择链路调用钩子 `transform_request` / `transform_reply` / `build_runtime` / `capabilities`，默认实现恒等透传；目录不含 `agent.py` 的纯配置 Agent 行为与旧版一致。

## 三、快速开始 / Quick Start

```bash
# 后端 Backend (Python 3.12+，项目根目录下 / from project root)
pip install -r requirements.txt
uvicorn mockagent_engine.main:app --host 0.0.0.0 --port 9100
# API 前缀 API prefix: http://127.0.0.1:9100/api/v1  （JWT 登录 / auth/login）

# 单独启动某个 Agent（等价于管理 API 的 start）
# Run a single agent standalone (equivalent to the management API start)
python -m mockagent_engine.standalone_agent --agent wireless-domain-stub

# 前端 Frontend (Node 18+, from frontend/)
npm install && npm run dev
```

- 实例管理：`POST /api/v1/mock-instances/{id}/start`（后端以 `python -m mockagent_engine.standalone_agent --agent <id>` 拉起，定义读取 `agents/<id>/agent.json`，端口 9005-9010）。
- Instance management: `POST /api/v1/mock-instances/{id}/start` spawns each agent on ports 9005-9010 (definitions read from `agents/<id>/agent.json`).
- 工作流模式：给实例配置 `"workflow": {"enabled": true, "workflowId": "live-assurance-demo"}` 后，向该实例发送意图请求即可触发端到端编排（工作流文件见 `scenarios/live-assurance-demo/workflow.json`）。
- Workflow mode: enable `"workflow": {"enabled": true, "workflowId": "live-assurance-demo"}` on an instance, then send an intent request to trigger end-to-end orchestration.
- LLM 模式：配置 OpenAI 兼容 `baseUrl`/`model`，密钥经环境变量 `MOCK_AGENT_LLM_API_KEY` 注入。
- LLM mode: configure an OpenAI-compatible `baseUrl`/`model`; the key is read from env `MOCK_AGENT_LLM_API_KEY`.
- 说明：`a2a-t-sdk` 与 `workflow-exec-engine` 来自 project-openan 开源仓库，若 PyPI 不可用可从源码安装：`pip install git+https://github.com/project-openan/workflow-engine-sdk-python`。
- Note: `a2a-t-sdk` / `workflow-exec-engine` come from the project-openan repositories; if unavailable on PyPI, install from source, e.g. `pip install git+https://github.com/project-openan/workflow-engine-sdk-python`.

## 四、验证状态 / Verification Status

- 数据集匹配：请求-响应成对回放全部命中（score=1.0），匹配溯源写入响应 metadata 与执行历史。
- 工作流编排：`live-assurance-demo` 端到端验证通过（意图解析 → 无线小区保障 → 直播质量诊断 → 结果聚合，远端步骤经 A2A-T 真实派发）。
- LLM 模式：单测覆盖（Mock Transport）；线上需真实 LLM 端点。

- Dataset mode: paired replay fully verified (score=1.0) with provenance in metadata and request history.
- Workflow mode: `live-assurance-demo` verified end-to-end (intent parsing → wireless cell assurance → live-stream diagnosis → aggregation; remote steps dispatched over real A2A-T).
- LLM mode: unit-tested with a mock transport; a live endpoint is required for online verification.

## 五、后续跟踪 / Follow-ups

需求统一在 [Issue #4](https://github.com/project-openan/openan-demo/issues/4) 跟踪。后续计划（部署脚本脱敏移植、真实 LLM 端点联调、实例端口对外暴露、密钥轮换）见该 issue。
Requirements are tracked in [Issue #4](https://github.com/project-openan/openan-demo/issues/4). Planned follow-ups (portable deploy scripts, live LLM endpoint integration, exposing instance ports, secret rotation) are listed there.
