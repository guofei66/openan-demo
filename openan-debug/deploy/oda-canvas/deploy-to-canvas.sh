#!/usr/bin/env bash
# OpenAN MockAgent 一键部署到 ODA-Canvas
# 用法:
#   ./deploy-to-canvas.sh <registry/repo:tag> [namespace]
# 示例:
#   ./deploy-to-canvas.sh registry.example.com/openan/mockagent:1.0.0 components
#   NO_PUSH=1 ./deploy-to-canvas.sh openan-mockagent:1.0.0 components   # 本地集群(kind/minikube 已 load 镜像)
# 可选环境变量:
#   SDK_SRC=/path/to/a2a-t-sdk-python/src/a2a_t
#   HELM_SETS="--set env.jwtSecret=xxx --set publicUrl=https://mock.example.com --set env.adminPassword=admin123"
set -euo pipefail
IMAGE="${1:?用法: ./deploy-to-canvas.sh <registry/repo:tag> [namespace]}"
NS="${2:-components}"
HERE="$(cd "$(dirname "$0")" && pwd)"
SDK_SRC="${SDK_SRC:-$(cd "$HERE/../../.." && pwd)/a2a-t-sdk-python/src/a2a_t}"
COMPONENT_NAME="openan-mockagent"   # = chart fullname（无 nameOverride 时）
RELEASE="mockagent"

echo "=== 0/5 前置检查 ==="
command -v docker >/dev/null || { echo "缺少 docker"; exit 1; }
command -v helm   >/dev/null || { echo "缺少 helm v3"; exit 1; }
kubectl get crd components.oda.tmforum.org >/dev/null 2>&1 \
  || { echo "未检测到 Component CRD —— 请先安装 ODA-Canvas（https://github.com/tmforum-oda/oda-canvas/blob/master/installation/README.md）"; exit 1; }
echo "Canvas CRD 检测通过，目标命名空间: $NS"

echo "=== 1/5 构建镜像 $IMAGE ==="
"${HERE}/build-image.sh" "${IMAGE%%:*}" "${IMAGE##*:}" "$SDK_SRC"

if [ "${NO_PUSH:-0}" != "1" ]; then
  echo "=== 2/5 推送镜像 ==="
  docker push "$IMAGE"
else
  echo "=== 2/5 跳过推送（NO_PUSH=1，请确保镜像已在集群节点可见）==="
fi

echo "=== 3/5 Helm 安装 Component（release=$RELEASE, ns=$NS）==="
helm upgrade --install "$RELEASE" "$HERE/chart/openan-mockagent" -n "$NS" --create-namespace \
  --set image.repository="${IMAGE%%:*}" --set image.tag="${IMAGE##*:}" ${HELM_SETS:-}

echo "=== 4/5 等待 Component Operator 分解完成（最长 5 分钟）==="
DEPLOY_STATUS=""
for _ in $(seq 1 60); do
  DEPLOY_STATUS=$(kubectl get components.oda.tmforum.org -n "$NS" "$COMPONENT_NAME" -o json 2>/dev/null \
    | grep -o '"deployment_status"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/' || true)
  if [ "$DEPLOY_STATUS" = "complete" ]; then break; fi
  sleep 5
done
kubectl get components.oda.tmforum.org -n "$NS" -o wide || true
[ "$DEPLOY_STATUS" = "complete" ] || {
  echo "组件状态: ${DEPLOY_STATUS:-<未上报>} —— 排查: kubectl describe component $COMPONENT_NAME -n $NS; kubectl logs -n canvas deploy/component-operator"; }

echo "=== 5/5 冒烟验证 ==="
POD=$(kubectl get pod -n "$NS" -l app.kubernetes.io/instance="$RELEASE" -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n "$NS" "$POD" -- curl -sf http://127.0.0.1:9000/healthz >/dev/null && echo "healthz ✓"
kubectl exec -n "$NS" "$POD" -- curl -sf http://127.0.0.1:9000/readyz  >/dev/null && echo "readyz  ✓"
kubectl exec -n "$NS" "$POD" -- curl -sf http://127.0.0.1:9000/debug/a2a/.well-known/agent-card.json | head -c 200; echo " …"
kubectl get exposedapis.oda.tmforum.org -n "$NS" 2>/dev/null | head -12 || true

cat <<EOF

部署完成。访问方式:
  kubectl -n $NS port-forward svc/openan-mockagent-core 9000:9000 9005:9005 9008:9008 9009:9009 9010:9010
  控制台: http://127.0.0.1:9000/debug/
  A2A-T:  http://127.0.0.1:9000/debug/a2a/message:send
启动打桩实例: 控制台「MockAgent 管理」或 POST /debug/api/v1/mock-instances/{id}/start
EOF
