# OpenAN A2A-T MockAgent —— ODA-Canvas / Kubernetes 镜像
# 构建上下文由 deploy/oda-canvas/build-image.(sh|ps1) 组装，包含：
#   openan_debug/   主服务包（server/openan_debug）
#   a2a_t/          A2A-T SDK 源码包（a2a-t-sdk-python/src/a2a_t）
#   config/         Mock Agent 实例定义（config/mock_agent_define.json 等）
#   requirements.txt
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    A2AT_LANGUAGE=zh-CN

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY a2a_t /app/a2a_t
COPY openan_debug /app/openan_debug
COPY config /app/config

# SQLite + 打桩实例工作目录（挂 PVC 时持久化 /app/data）
RUN mkdir -p /app/data/mock_agents
VOLUME ["/app/data"]

ENV OPENAN_DEBUG_HOST=0.0.0.0 \
    OPENAN_DEBUG_PORT=9000 \
    OPENAN_DEBUG_DB_PATH=data/openan-debug.db

EXPOSE 9000 9005 9006 9007 9008 9009 9010

CMD ["uvicorn", "openan_debug.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "9000"]
