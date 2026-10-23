# OpenAN-Debug 系统设计文档

日期：2026-09-28
状态：已与需求方逐节确认

## 1. 背景与目标

OpenAN 对接联调需要一个独立于真实业务 Agent 的调试环境。OpenAN-Debug 提供：

1. **A2A-T Mock Agent**：一个真实可访问的 A2A-T 服务端点，接收 OpenAN 侧（orchestration-center / 业务系统）发出的 A2A-T 请求，完整走协议流程，返回打桩（stub）业务数据。
2. **打桩数据生成**：用户提供种子数据（真实业务样本 JSON），在本地用大模型泛化为多条变体，再上传到服务器变体池。
3. **OpenAN-Debug Web 系统**：支持用户登录，提供种子/变体管理、联调请求调试台（输入请求 body → 查看 Response）、请求历史。
4. **部署**：部署到阿里云服务器 47.120.10.111，与现有 OpenAN 网站共存。

**明确不做（YAGNI）**：服务器端 LLM 调用、Mock Agent 集群、性能压测、多租户。

## 2. 关键决策记录

| 决策点 | 结论 |
|---|---|
| 协议处理深度 | 完整协议流程：A2ATServer 校验 → 参数抽取 → Negotiation-T 协商 → 打桩 Artifact |
| 打桩数据生成形态 | 样本变体泛化：一条真实样本 → LLM 泛化多条变体（改单号/用户/时间等） |
| 泛化执行位置 | 本地泛化（用户环境调 LLM），泛化结果通过页面导入上传服务器；服务器不调 LLM |
| 系统功能 | 登录 + 种子/变体管理 + 联调请求调试台（body 输入/Response 展示/历史回看）+ 用户管理（admin） |
| 技术栈 | 后端 Python FastAPI（依赖 a2a-sdk + a2a-t-sdk-python）+ React 前端；SQLite 存储 |
| 部署形态 | 单体 FastAPI 应用（方案 A），Nginx 路径分流，只开 80 端口 |
| 扩展预留 | 数据模型按 (organization, agentName, templateUri) 三元组设计，预留多 Agent 虚拟化 |

## 3. 总体架构

```
OpenAN 侧（orchestration-center / 联调业务系统）
    │  A2A-T 请求（HTTP+JSON binding，SendMessageRequest，
    │  Message.metadata 携带 extension URI + prompt_text + templateUri + negotiationContext）
    ▼
阿里云 47.120.10.111（只开放 80 端口，不影响现有网站）
    ├─ Nginx
    │   ├─ /debug/            → React 前端静态文件
    │   ├─ /debug/api/v1/...  → 反代 127.0.0.1:9000（登录/种子/变体/调试台/历史）
    │   └─ /debug/a2a/...     → 反代 127.0.0.1:9000（Mock Agent 对外端点）
    └─ openan-debug.service（systemd 托管 uvicorn，监听 127.0.0.1:9000，单体 FastAPI）
        ├─ Mock Agent 模块（官方 a2a-sdk REST handler + a2a-t-sdk-python A2ATServer）
        ├─ Debug API 模块（JWT 登录、种子/变体 CRUD、调试代理、历史查询）
        └─ SQLite（users / agents / seeds / variants / request_logs）
```

- 联调接入方式一：OpenAN 侧将 AgentCard 的 `supportedInterfaces[0].url` 直接配置为 `http://47.120.10.111/debug/a2a/`。
- 联调接入方式二：将 Mock Agent 的 AgentCard 注册进 registry-center，走正常发现流程。
- Mock Agent 暴露标准 AgentCard 端点 `GET /debug/a2a/agent-card`，与官方 A2A SDK 客户端兼容。

## 4. Mock Agent 协议处理流程

```
收到 SendMessageRequest（HTTP+JSON binding）
 1. 提取 Message.metadata → extension URI → prompt_text + templateUri（+ negotiationContext）
 2. A2ATServer.check_task_prompt 合法性校验
    ├─ 不合法 → 任务置 REJECTED，返回错误明细（slot/code/message）
 3. validate_*_prompt_and_data_filling 参数抽取
    ├─ 缺参 → 用 SDK 生成 Negotiation-T propose（列出缺失 slot）→ 任务置 INPUT_REQUIRED
    │         后续轮次按 negotiationContext 推进（round/maxRounds），支持 accept/reject/abort
 4. 参数齐全 → 按 (agentName, templateUri) 路由到变体池
    ├─ 变体支持 {{slots.xxx}} 占位符：返回前用请求抽取的参数做纯字符串回填（服务器不调 LLM）
    ├─ 变体池轮询（round-robin，按 seq 顺序循环）取一个；无可用变体 → 返回可读的配置缺失错误
 5. 推送 SUBMITTED → WORKING → COMPLETED 状态事件 + 业务打桩数据 Artifact
 6. 响应头回显 A2A-Extensions（协议要求）
```

要点：
- 变体占位符回填使打桩数据携带请求上下文（单号、时间等），无需服务器 LLM。
- Negotiation-T 协商轮次完整走 SDK 状态机，覆盖协商分支联调。
- templateUri 与支持的模板家族（Task-T / Notification-T / Authorization-T / Negotiation-T）由种子数据绑定关系动态决定，Mock Agent 不硬编码模板清单。

## 5. 数据模型（SQLite）

| 表 | 关键字段 | 说明 |
|---|---|---|
| `users` | id, username, password_hash(bcrypt), role(admin/user), created_at | 登录账户，admin 可建号/禁用 |
| `agents` | id, organization, name, description, enabled, created_at | 虚拟 Agent 档案（预留多 Agent） |
| `seeds` | id, agent_id, template_uri, name, seed_json, description, created_by, created_at | 种子数据（真实业务样本） |
| `variants` | id, seed_id, agent_id, template_uri, variant_json, enabled, source(llm/manual/import), seq, created_at | 泛化变体池，打桩时按 seq 轮询取用 |
| `request_logs` | id, agent_id, template_uri, direction(inbound/console), request_body, response_body, task_state, negotiated, latency_ms, user_id, created_at | 全量请求历史 |

首次启动自动初始化 schema 与默认 admin 账户（随机密码，输出到部署日志）。

## 6. 泛化流程（本地 → 服务器）

1. **本地工具** `tools/stub-generator`（Python CLI）：
   - 输入：种子 JSON 文件 + 模板 URI + 生成条数 N
   - 参数：`--base-url / --api-key / --model`（OpenAI 兼容接口）
   - 逻辑：构造泛化 Prompt（保持 JSON 结构不变，替换单号/用户/时间/数值等标识性字段）→ 调 LLM → 解析校验 N 条变体
   - 输出：`variants.json`（数组，每条含 variant_json 与可选描述）
2. **页面导入**：调试系统"种子管理"页上传 `variants.json` → 服务端按 JSON 结构校验 → 批量入库 → 变体列表可预览、启停、编辑。

## 7. Web 系统页面与 API

### 页面（React，5 个）

1. **登录页** — JWT 登录，401 自动跳转。
2. **种子数据管理** — 种子列表/新建/编辑（选择模板 URI）；导入变体文件；变体预览、启停、编辑。
3. **调试控制台** — 请求 body 编辑器（JSON 高亮）+ 模板 URI 快捷填充示例请求；发送 → Response 树状/原文视图；左侧历史会话列表可回看。
4. **请求历史** — 全量记录（按时间/模板/状态筛选）+ 请求/响应对照详情。
5. **用户管理**（仅 admin）— 建号/禁用。

### Debug API（JWT 保护）

| 方法与路径 | 说明 |
|---|---|
| `POST /api/v1/auth/login`、`GET /api/v1/auth/me` | 登录、当前用户 |
| `CRUD /api/v1/agents` | 虚拟 Agent 档案管理 |
| `CRUD /api/v1/seeds` | 种子管理 |
| `POST /api/v1/seeds/{id}/variants/import` | 导入泛化变体 |
| `GET/PATCH /api/v1/variants` | 变体查询/启停/编辑 |
| `POST /api/v1/console/send` | 调试代理：接收用户输入的请求 body，转发到本机 Mock Agent 端点，同步返回响应并记录历史（`direction=console`，与真实联调请求同表） |
| `GET /api/v1/history`、`GET /api/v1/history/{id}` | 历史分页筛选与详情 |
| `CRUD /api/v1/users`（admin） | 用户管理 |

## 8. 部署方案（阿里云 47.120.10.111）

- 代码目录：`/OpenA2A-T/openan-debug/`（代码 + venv + SQLite 数据库文件）。
- 前端静态文件：`/OpenA2A-T/openan-debug-frontend/`，上传方式沿用现有 paramiko SFTP 脚本模式。
- systemd 服务 `openan-debug.service`：uvicorn 监听 `127.0.0.1:9000`，`Restart=always`，开机自启。
- Nginx 追加 location：`/debug/`（静态资源 try_files）、`/debug/api/`、`/debug/a2a/`（反代 9000）。
- 公网只走 80 端口，不额外开放端口。
- 管理员账户首次启动自动初始化，随机密码输出到部署日志并通知需求方。

## 9. 测试与验收标准

| 项 | 验证方式 |
|---|---|
| Mock Agent 协议正确性 | pytest 单测：校验失败→REJECTED；缺参→INPUT_REQUIRED+propose；协商 accept/reject/abort 各分支；参数齐全→COMPLETED+变体 Artifact；占位符回填正确 |
| 端到端联调 | 用 a2a-t-sdk-python sample client（subscribe-incident 样例）改 base_url 指向服务器，真实打一轮：Task-T / Notification-T / 协商流程 |
| 调试控制台 | 页面粘贴请求 body → 收到 Response → 历史可查 |
| 登录鉴权 | 未登录访问 API 返回 401；JWT 过期跳转登录 |
| 部署验证 | 服务器 curl AgentCard 端点 200；本机浏览器登录页面可用；服务器重启后服务自恢复 |
| 代码质量 | 后端 pytest 全绿；前端 build 成功、lint 通过 |
```
