"""独立 Mock Agent 实例 runner（可选的「独立进程」模式入口）。

默认架构下实例由主服务在进程内挂载（见 instance_runtime.py，单进程单端口）；
本入口仅在需要独立进程形态时手动运行：

    python -m openan_debug.standalone_agent --define config/mock_agent_define.json --instance <id>

设计要点：
- 实例声明来自 mock_agent_define.json：端口 / 工作目录 / 模型连接方案（A2AT_LLM_*）/ Agent 信息 / 初始桩变体；
- 与主调试服务共用同一 SQLite（Agent 行、变体池、历史联调记录 RequestLog），便于在调测台统一管理；
- 模型连接方案写入 <工作目录>/llm.env，实例的 FlowEnvironment/A2ATServer 以该文件构造；
  llm.enabled=false 时写入 dummy 方案（即"LLM-less fallback mode"纯打桩）；
- 工作流派发目标同样指向主服务内挂载路径（端口回环），与本服务端口无耦合。
"""
import argparse
import json
import os
from pathlib import Path

import uvicorn
from fastapi import FastAPI

from .agent.a2a_app import build_a2a_app
from .config import load_settings
from .instance_runtime import build_instance_runtime, merged_llm

DEFINE_FILENAME = "mock_agent_define.json"


def resolve_define_path(explicit: str | None) -> Path:
    candidates = []
    if explicit:
        candidates.append(Path(explicit))
    override = os.environ.get("OPENAN_DEBUG_MOCK_DEFINE")
    if override:
        candidates.append(Path(override))
    cwd = Path.cwd()
    candidates += [
        cwd / "config" / DEFINE_FILENAME,
        cwd / DEFINE_FILENAME,
        cwd.parent / "config" / DEFINE_FILENAME,
        cwd.parent / DEFINE_FILENAME,
        Path(__file__).resolve().parents[2] / "config" / DEFINE_FILENAME,
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise SystemExit(f"未找到 {DEFINE_FILENAME}；可用 --define 或 OPENAN_DEBUG_MOCK_DEFINE 指定路径")


def build_runner_app(instance: dict, define: dict, settings) -> FastAPI:
    """独立进程模式的实例应用：health + A2A（装配逻辑与进程内模式共用 instance_runtime）。"""
    entry = build_instance_runtime(instance, define, settings)  # 不传 engine → 自建引擎
    llm = merged_llm(instance, define)
    name = instance.get("agentName") or instance["name"]

    app = FastAPI(title=f"Mock Agent · {name}")

    @app.get("/health")
    @app.get("/api/v1/health")
    async def health():
        return {
            "status": "ok",
            "instance": instance.get("id"),
            "agentId": entry["agent_id"],
            "llm": "enabled" if llm.get("enabled") else "stub-fallback",
        }

    app.mount("/", entry["a2a_app"])
    app.state.mock_instance = {"id": instance.get("id"), "agentId": entry["agent_id"], "workDir": str(Path(instance["workDir"]))}
    return app


def main() -> None:
    parser = argparse.ArgumentParser(description="OpenAN-Debug standalone mock agent instance")
    parser.add_argument("--define", default=None, help="mock_agent_define.json 路径")
    parser.add_argument("--instance", required=True, help="实例 id")
    parser.add_argument("--host", default=None, help="覆盖实例 host")
    parser.add_argument("--port", type=int, default=None, help="覆盖实例 port")
    args = parser.parse_args()

    define_path = resolve_define_path(args.define)
    define = json.loads(define_path.read_text(encoding="utf-8"))
    instance = next((item for item in define.get("instances", []) if item.get("id") == args.instance), None)
    if instance is None:
        raise SystemExit(f"实例 {args.instance!r} 未在 {define_path} 中定义")

    settings = load_settings()
    host = args.host or instance.get("host") or define.get("defaults", {}).get("host", "0.0.0.0")
    port = args.port or int(instance.get("port", 9300))
    instance = {**instance, "host": host, "port": port}

    app = build_runner_app(instance, define, settings)
    work_dir = Path(instance["workDir"])
    (work_dir / "instance.pid").write_text(str(os.getpid()), encoding="utf-8")
    name = instance.get("agentName") or instance["name"]
    print(
        f"[standalone-agent] 实例 {instance['id']} ({name}) 启动：http://{host}:{port} "
        f"workDir={work_dir} define={define_path}",
        flush=True,
    )
    try:
        uvicorn.run(app, host=host, port=port, log_level="info")
    finally:
        pid_file = work_dir / "instance.pid"
        if pid_file.exists():
            pid_file.unlink()


if __name__ == "__main__":
    main()
