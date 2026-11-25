# -*- coding: utf-8 -*-
# Copyright (c) 2026 Huawei Technologies Co., Ltd.
# All Rights Reserved.
#
# SPDX-License-Identifier: Apache-2.0
#
#    Licensed under the Apache License, Version 2.0 (the "License"); you may
#    not use this file except in compliance with the License. You may obtain
#    a copy of the License at
#
#         http://www.apache.org/licenses/LICENSE-2.0
#
#    Unless required by applicable law or agreed to in writing, software
#    distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
#    WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
#    License for the specific language governing permissions and limitations
#    under the License.

"""MockAgent 网关模式：单进程单端口承载全部打桩实例。

解决"每个 Agent 占一个端口"的端口不足问题：全部 Agent 挂载在同一个
FastAPI 应用下，按路径前缀区分：

    http://<host>:<port>/agents/<agent-id>/

每个实例的 A2A 端点（AgentCard / message:send / tasks:subscribe ...）与
独立实例完全一致，只是多了 /agents/<agent-id> 前缀；AgentCard 的
supportedInterfaces.url 自动带上该前缀，编排中心/其它智能体按卡片 URL
即可直接派发。

工作流编排模式同样可用：agent_cards_for() 优先使用实例的 publicUrl
（网关注入的前缀地址），SELF_LOOP 之外的远端步骤经同一端口真实派发。

用法 / Usage:
    # 全部 agents/ 下的实例（含 6 个 SPN stub + 20 个 AN L4）
    python -m mockagent_engine.gateway --port 9300

    # 只挂载部分实例
    python -m mockagent_engine.gateway --agents an-l4-ran-agent,an-l4-cross-domain-fault-management-agent

    # 卡片对外公布地址（反向代理/跨机访问时）
    python -m mockagent_engine.gateway --public-url-base http://<外部地址>:9300
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import uvicorn
from fastapi import FastAPI

from .agent_registry import AGENT_FILENAME, agents_dir, load_agent, load_agent_instance, load_defaults
from .config import load_settings
from .db import init_db, make_engine
from .heartbeat import HeartbeatReporter, collect_cards
from .standalone_agent import build_runner_app


def select_instances(agent_filter: list[str] | None) -> list[tuple[Path, dict]]:
    """读取 agents/ 下的实例定义，可按 id 过滤；保持目录序稳定。

    返回 (agent_dir, instance) 以便网关为每个实例加载 agent.py 子类。
    """
    instances = []
    for agent_dir in sorted(agents_dir().iterdir()):
        if not agent_dir.is_dir():
            continue
        path = agent_dir / AGENT_FILENAME
        if not path.is_file():
            continue
        instance = load_agent(agent_dir)
        if agent_filter and instance.get("id") not in agent_filter:
            continue
        instances.append((agent_dir, instance))
    return instances


def build_gateway_app(
    instances: list[tuple[Path, dict]],
    define_defaults: dict,
    *,
    public_url_base: str,
    settings,
) -> FastAPI:
    """把全部实例挂载到 /agents/<id>/ 前缀下，共享一个 SQLite engine。"""
    define = {"version": 1, "defaults": define_defaults, "instances": [i for _, i in instances]}
    engine = make_engine(settings)
    init_db(engine, settings)

    gateway = FastAPI(
        title="MockAgent Gateway",
        description="Single-port MockAgent gateway: every stub instance lives under /agents/<id>/",
    )

    @gateway.get("/health")
    @gateway.get("/api/v1/health")
    async def health():
        return {
            "status": "ok",
            "mode": "gateway",
            "agents": [
                {
                    "id": inst.get("id"),
                    "name": inst.get("agentName") or inst.get("name"),
                    "path": f"/agents/{inst.get('id')}/",
                    "card": f"{public_url_base}/agents/{inst.get('id')}/.well-known/agent-card.json",
                    "skills": len(inst.get("skills") or []),
                }
                for _, inst in instances
            ],
        }

    for agent_dir, instance in instances:
        agent_id = instance["id"]
        # Agent 子类：agents/<id>/agent.py 承载差异化能力（无 agent.py 时为基类），
        # 与独立实例模式保持一致。
        agent = load_agent_instance(agent_dir)
        prefixed = {**instance, "publicUrl": f"{public_url_base}/agents/{agent_id}"}
        app = build_runner_app(prefixed, define, settings, agent=agent, engine=engine)
        gateway.mount(f"/agents/{agent_id}", app)
        print(
            f"[gateway] /agents/{agent_id}/ -> {prefixed.get('agentName') or instance.get('name')}",
            flush=True,
        )

    # 兜底：供网关进程在收到退出信号时落盘当前清单（便于排障）。
    @gateway.get("/agents")
    async def agents_index():
        return {"instances": [inst.get("id") for _, inst in instances]}

    gateway.state.mock_gateway = {
        "publicUrlBase": public_url_base,
        "instances": [inst.get("id") for _, inst in instances],
    }

    # 注册中心心跳上报：为挂载实例对应的注册卡片周期性上报存活。
    # 卡片清单以 agents/*/agent_card.json 为准（与 register_mockagents.py 一致）。
    if settings.heartbeat_enabled:
        cards = collect_cards(settings.heartbeat_prefix)
        if cards:
            reporter = HeartbeatReporter(
                cards, settings.registry_url, settings.heartbeat_owner,
                interval=settings.heartbeat_interval,
            )
            gateway.state.heartbeat_reporter = reporter

            @gateway.on_event("shutdown")
            async def _stop_heartbeat() -> None:
                reporter.stop()

            reporter.start()
        else:
            print("[heartbeat] agents/ 下无匹配卡片，跳过心跳上报", flush=True)
    return gateway


def main() -> None:
    parser = argparse.ArgumentParser(description="MockAgent gateway (all stub instances on one port)")
    parser.add_argument("--host", default=None, help="监听地址（默认取 _defaults.json host）")
    parser.add_argument("--port", type=int, default=9300, help="网关端口（默认 9300）")
    parser.add_argument("--agents", default=None, help="仅挂载这些实例 id，逗号分隔（默认全部）")
    parser.add_argument(
        "--public-url-base",
        default=None,
        help="卡片对外公布的基础地址，默认 http://127.0.0.1:<port>（跨机/反代时显式指定）",
    )
    args = parser.parse_args()

    defaults = load_defaults()
    host = args.host or defaults.get("host", "0.0.0.0")
    agent_filter = [a.strip() for a in args.agents.split(",") if a.strip()] if args.agents else None
    loaded = select_instances(agent_filter)
    if not loaded:
        raise SystemExit("没有可挂载的实例：检查 agents/ 目录或 --agents 过滤条件")
    instances = [inst for _, inst in loaded]

    public_url_base = args.public_url_base or f"http://127.0.0.1:{args.port}"
    settings = load_settings()
    app = build_gateway_app(
        loaded, defaults, public_url_base=public_url_base, settings=settings
    )

    ids = [inst.get("id") for inst in instances]
    (Path("data") / "gateway_manifest.json").parent.mkdir(parents=True, exist_ok=True)
    (Path("data") / "gateway_manifest.json").write_text(
        json.dumps({"port": args.port, "publicUrlBase": public_url_base, "agents": ids},
                   ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(
        f"[gateway] {len(instances)} 个实例挂载完成：{public_url_base}/agents/<id>/",
        flush=True,
    )
    try:
        uvicorn.run(app, host=host, port=args.port, log_level="info")
    finally:
        manifest = Path("data") / "gateway_manifest.json"
        if manifest.exists():
            manifest.unlink()


if __name__ == "__main__":
    main()
