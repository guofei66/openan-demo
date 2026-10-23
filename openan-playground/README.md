# OpenAN-Debug

OpenAN 对接联调系统：A2A-T Mock Agent（完整协议流程 + 打桩数据）+ 调试 Web（登录/种子变体管理/联调调试台/请求历史）。

## 结构

- `server/`：FastAPI 单体（Debug API `/api/v1/*` + Mock Agent `/debug/a2a/*`），SQLite。
- `frontend/`：React + Vite，构建后部署 `/OpenA2A-T/openan-debug-frontend`，访问路径 `/debug/`。
- `tools/stub_generator/`：本地 LLM 泛化 CLI（种子 → 变体 JSON）。
- `deploy/`：阿里云 47.236.98.226 部署脚本与配置（nginx 独立 server 块，端口 9004）。

## 本地开发

cd server && uv sync && uv run pytest
cd server && OPENAN_DEBUG_ADMIN_PASSWORD=admin-pass-01 uv run uvicorn "openan_debug.main:create_app" --factory --port 9000
cd frontend && npm install && npm run dev    # http://localhost:5180/debug/

## 打桩数据流

1. 页面上传种子（或 API POST /api/v1/seeds）。
2. 本地：python tools/stub_generator/cli.py --seed seed.json --template-uri "..." --count 5 --base-url ... --api-key ... --model ...
3. 页面"导入泛化变体"上传 variants.json。

## 联调

- Mock Agent 卡片：http://47.236.98.226:9004/debug/a2a/.well-known/agent-card.json
- 请求端点：POST http://47.236.98.226:9004/debug/a2a/message:send（HTTP+JSON binding），流式 /message:stream
- OpenAN 侧把 AgentCard supportedInterfaces[0].url 指向上址，或注册进 registry-center。
- 服务器 .env 配好 A2AT_LLM_* 后启用完整协议（协商分支）；未配置时自动降级直接打桩。

## 部署

cd frontend && npm run build
python deploy/deploy.py     # 打包上传 + 远端 uv 安装 + systemd + nginx + 健康检查
cd server && uv run python ../deploy/verify_remote_e2e.py
