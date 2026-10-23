# MockAgent 在 ODA-Canvas 环境部署

将 OpenAN A2A-T MockAgent 打包为 [ODA-Canvas](https://github.com/tmforum-oda/oda-canvas) 可运行的 **ODA Component**：一个 Component 内含**内嵌默认 Agent + 6 个打桩 Agent 实例**，通过 Canvas 的 Component Operator / API Operator 自动分解、注册与暴露 API。

```
oda-canvas (K8s)
└── Component: openan-mockagent (oda.tmforum.org/v1beta3)
    ├── coreFunction.exposedAPIs
    │   ├── mockagent-a2a            :9000 /debug/a2a     ← 内嵌默认 Agent（A2A-T 协议）
    │   ├── mockagent-fault-diagnosis:9005 /              ← 打桩实例（独立 A2A 应用）
    │   ├── mockagent-recovery       :9006 /
    │   ├── mockagent-energy-saving  :9007 /
    │   ├── mockagent-wireless-domain:9008 /
    │   ├── mockagent-livestream     :9009 /
    │   └── mockagent-service-assurance :9010 /
    ├── managementFunction.exposedAPIs
    │   └── mockagent-console        :9000 /debug         ← 调测控制台 + 管理 REST
    └── securityFunction: canvasSystemRole=admin, componentRole=[admin,user]
```

## 0. 前置条件

1. 已安装 ODA-Canvas（>= 1.0，支持 v1beta3 组件规范）：
   ```bash
   # 参考 https://github.com/tmforum-oda/oda-canvas/blob/master/installation/README.md
   kubectl create namespace canvas
   helm install canvas oda-canvas/charts/canvas-oda -n canvas
   ```
2. 已配置镜像仓库（Registry），且集群可拉取。
3. 本机有 `docker`、`helm`（v3）、`kubectl`。

## 1. 构建镜像

构建脚本会把 `server/openan_debug`、`config/`、A2A-T SDK 源码（`a2a-t-sdk-python/src/a2a_t`）组装进构建上下文：

```powershell
# Windows
cd deploy/oda-canvas
./build-image.ps1 -Image openan-mockagent -Tag 1.0.0
docker tag openan-mockagent:1.0.0 <registry>/openan-mockagent:1.0.0
docker push <registry>/openan-mockagent:1.0.0
```

```bash
# Linux/macOS
cd deploy/oda-canvas
./build-image.sh openan-mockagent 1.0.0 /path/to/a2a-t-sdk-python/src/a2a_t
```

镜像内容：Python 3.11-slim + FastAPI/uvicorn + a2a_t SDK；`config/mock_agent_define.json`（实例定义与 6060 对数据集索引随镜像分发）；数据（SQLite + 实例工作目录）写入 `/app/data`。

## 2. 安装 Component

### 方式 A：Helm（推荐）

```bash
helm install mockagent deploy/oda-canvas/chart/openan-mockagent \
  -n components --create-namespace \
  --set image.repository=<registry>/openan-mockagent \
  --set image.tag=1.0.0 \
  --set env.jwtSecret=$(openssl rand -hex 32)
```

### 方式 B：静态 YAML（先自建 Deployment/Service 再 apply Component）

`component-example.yaml` 是已渲染的 v1beta3 Component（service 名固定为 `openan-mockagent-core`）：

```bash
kubectl apply -f deploy/oda-canvas/component-example.yaml -n components
```

## 3. 验证

```bash
# Canvas Component Operator 分解状态（in-progress → complete）
kubectl get components.oda.tmforum.org -n components
kubectl get components.oda.tmforum.org -n components -o wide   # deployment_status 列

# 分解出的 API 资源（API Operator 逐一处理）
kubectl get exposedapis,dependentapis -n components

# Pod 与探针
kubectl get pods -n components
kubectl -n components port-forward svc/openan-mockagent-core 9000:9000 9005:9005 9008:9008 9009:9009 9010:9010
curl http://127.0.0.1:9000/healthz        # {"status":"ok"}
curl http://127.0.0.1:9000/readyz         # 数据库可读
curl http://127.0.0.1:9000/debug/a2a/.well-known/agent-card.json
curl http://127.0.0.1:9008/.well-known/agent-card.json
```

启动打桩实例（二选一）：
- 控制台：`http://<ingress>/debug/` → MockAgent 管理 → 启动；
- REST：`POST /debug/api/v1/mock-instances/wireless-domain-stub/start`（JWT 鉴权）。

之后即可用 A2A-T SDK / 调测台对任一 Agent 发 `/message:send`、`/message:stream`；MockAgent 检索数据集返回最接近的成对响应（`datasetMatch` 可在执行历史中查看）。

## 4. Canvas 交互说明

| Canvas 机制 | 本组件的对接点 |
|---|---|
| Component Operator 分解 | `component.yaml` → 逐个 `exposedAPIs` 生成 API 资源 |
| API Operator / 网关注册 | 每个打桩实例以独立 `port` + `path` 暴露；`specification` 指向 `/openapi.json`（FastAPI 自动生成） |
| Identity Config | `securityFunction.canvasSystemRole: admin`；`componentRole` 声明 admin/user 两角色（控制台 JWT 内的 role 对应） |
| 观测 | `liveness /healthz`、`readiness /readyz`（免鉴权）；执行历史 REST 可接 Canvas Portal |

> v1beta3 说明：Canvas 1.1.x 起核心规范为 v1beta3（`exposedAPIs[].specification` 为 URL 数组，必填 `name/apiType/implementation/path/port`）。当前 Canvas master 的 CRD 已包含 `v1`（storage 版），升级到仅支持 v1 的 Canvas 时，把 `component.yaml` 的 `apiVersion` 改为 `oda.tmforum.org/v1` 并将 `spec.id/name/...` 移入 `spec.componentMetadata`、`specification` 数组元素改为 `{url: ..., version: ...}` 对象即可（Webhook 通常也会自动转换）。

## 5. 生产配置项

| 配置 | 位置 | 说明 |
|---|---|---|
| `env.jwtSecret` | values / Secret | **必改**：控制台 JWT 签名密钥 |
| `env.datasetSearch` | values | `off` 关闭数据集检索（纯变体池打桩） |
| `env.stubFallback` | values | `off` 关闭变体池兜底 |
| `persistence.enabled/size` | values | SQLite + 实例工作目录持久化（默认 2Gi） |
| `agents[*]` | values | 打桩实例清单（须与镜像内 `config/mock_agent_define.json` 端口一致） |
| `publicUrl` | values | 外部访问地址，回填进 Agent Card；留空用集群内 service 地址 |
| `component.id` | values | ODA 组件编号（默认 TMFC900 自定义联调域） |

## 6. 卸载

```bash
helm uninstall mockagent -n components      # 或 kubectl delete component openan-mockagent -n components
kubectl delete pvc openan-mockagent -n components   # 如需清数据
```

Canvas 会通过 Component Operator 级联清理分解出的 API/网关资源。
