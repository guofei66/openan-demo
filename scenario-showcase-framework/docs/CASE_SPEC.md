# Scenario Case Spec — 场景 Case 框架规范 (v2)

多智能体协作场景统一用这套配置驱动。前端框架（布局、智能体团队、PSOP 协作流程、
A2A-T 消息流、多模态附件、面板）完全复用，新增场景 **不改代码、只加配置**。

## 1. Case 文件

放置 `cases/<id>.json`，并在 `cases.json` 索引登记（无需重新构建插件）。

```jsonc
{
  "$schema": "scenario-showcase-case-v2",
  "id": "net-optimize",
  "driver": "script",              // "script"(默认,纯Demo回放) | "mockAgent"(服务返回消息)
  "mockAgent": {                   // 仅 driver=mockAgent 需要
    "endpoint": "http://<host>:9015/mockagent",
    "caseKey": "net-optimize",     // 服务端消息库文件名 banks/<caseKey>.json
    "turnDelayMs": 1600            // 两条消息间的默认节奏(ms)
  },
  "title": { "zh": "...", "en": "..." },        // 双语字段统一 {zh,en}
  "description": { "zh": "...", "en": "..." },
  "agents": [                      // 智能体团队 —— 跟着场景变化
    { "id": "insight", "name": {zh,en}, "role": "host|domain|support",
      "color": "blue|indigo|emerald|amber|violet|cyan|rose", "skills": ["..."] }
  ],
  "steps": [                       // PSOP 工作流步骤 —— 跟着场景变化
    { "id": "t1", "name": {zh,en}, "short": {zh,en}, "agent": "insight",
      "type": "selfloop|allsuccess", "skill": "...", "task": "task-..." }
  ],
  "panels": [                      // 底部面板（map/chart，可插拔）
    { "id": "...", "type": "chart", "title": {zh,en},
      "initial": { "points": { "s1": [86] } },
      "config": { "series": [ { "id": "s1", "name": {zh,en}, "color": "#f59e0b", "fill": true } ],
                  "yMin": 0, "yMax": 100 } }
  ],
  "history": [                     // 场景历史（左侧栏）
    { "id": "run-1", "time": "2026-10-19 23:05", "title": {zh,en},
      "result": "success|partial", "duration": "18m 40s",
      "mode": "agent" }            // "demo"(纯Demo回放,默认) | "agent"(mockAgent执行)
  ],
  "script": [ /* 仅 driver=script：与事件同构，见 §3 */ ]
}
```

## 2. 交互驱动（driver）

| driver | 用途 | 消息来源 |
|---|---|---|
| `script`（默认） | **纯 Demo 演示**（如 live-assurance） | case 内置 `script[]` 时间线，前端本地回放，**不调用 mockAgent** |
| `mockAgent` | 智能体联调/准实时交互 | 前端 `MockAgentDriver` 向 mockAgent 服务逐条拉取，**消息内容由 mockAgent 返回** |

两种驱动产出**同一套规范化事件流**，UI 组件完全无感：

```
{type:'message', from, to, kind:'request|response|info|alert|a2at', step, text:{zh,en},
 attachments?: [...], a2at?: {verb, session, decision?, clauses:[{k:{zh,en}, v:{zh,en}}]} }
{type:'step', id, status:'active|done'}
{type:'panel', panel, action:'set|push|merge', data:{...}}
```

`from`/`to` 必填（A2A-T 信封展示）；`attachments` 支持 kpi/table/spark/image/list。

## 3. mockAgent 服务

`mockagent/server.py`（纯 Python 标准库，端口 9015）：

- `POST /mockagent/start {case}` → `{ok, session, total}`
- `POST /mockagent/next {session}` → `{ok, event, remaining}`；取尽后返回 `{type:'done'}`
- `POST /mockagent/reset {session}` → 重放
- 消息库：`mockagent/banks/<caseKey>.json` = `[{ "waitMs":1600, "event":{...} }, ...]`
  （event 同 §2，可多带 `waitMs` 控制该条节奏）

新增一个 mockAgent 场景 = 新增 `cases/<id>.json` + `mockagent/banks/<caseKey>.json` +
`cases.json` 登记，**零代码改动**。

## 4. 深链与部署

- 深链：`/scenario-showcase/?v=N&case=<id>`（v 为缓存版本号，N 递增）
- standalone(:9010)：`dist/` + `cases.json` + `cases/*.json`；插件(:9003)：`dist-plugin/` + 同样
  的 cases 文件（运行时 fetch，no-store）
- mockAgent 服务：`/opt/openan-demo/mockagent/`，`nohup python3 server.py &`
