#!/usr/bin/env bash
# 组装构建上下文并构建 OpenAN MockAgent 镜像（用于 ODA-Canvas 部署）
# 用法: ./build-image.sh [image] [tag] [a2a_t SDK 源码目录]
set -euo pipefail
IMAGE="${1:-openan-mockagent}"
TAG="${2:-1.0.0}"
SDK_SRC="${3:-$(dirname "$0")/../../../a2a-t-sdk-python/src/a2a_t}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CTX="$(mktemp -d)"
echo "构建上下文: $CTX"

cp -r "$REPO_ROOT/server/openan_debug" "$CTX/openan_debug"
cp -r "$REPO_ROOT/config" "$CTX/config"
cp -r "$SDK_SRC" "$CTX/a2a_t"
{
  cat "$REPO_ROOT/server/requirements.txt"
  echo "# --- a2a_t SDK 运行依赖 ---"
  SDK_REQ="$(dirname "$SDK_SRC")/../requirements.txt"
  if [ -f "$SDK_REQ" ]; then cat "$SDK_REQ"; fi
} > "$CTX/requirements.txt"
cp "$0/../Dockerfile" "$CTX/Dockerfile" 2>/dev/null || cp "$(dirname "$0")/Dockerfile" "$CTX/Dockerfile"

(
  cd "$CTX"
  docker build -t "$IMAGE:$TAG" -t "$IMAGE:latest" .
)
rm -rf "$CTX"
echo "镜像构建完成: $IMAGE:$TAG"
echo "推送: docker tag $IMAGE:$TAG <registry>/<repo>:$TAG && docker push <registry>/<repo>:$TAG"
