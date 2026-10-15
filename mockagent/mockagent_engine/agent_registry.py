# -*- coding: utf-8 -*-
"""Agent 注册表：每个打桩 Agent 是 agents/ 下的一个独立目录。

布局 / Layout:
    agents/
    ├── _defaults.json              # 共享基线（llm 默认、12 模板变体池、workDirRoot 等）
    └── <agent-id>/agent.json       # 单个 Agent 定义（名称/端口/数据集范围/变体/工作流）

`load_define()` 把目录聚合成旧版单文件 define 形态（{"defaults", "instances"}），
路由层与启动器均通过本模块访问 Agent 定义。
"""
from __future__ import annotations

import json
import os
from pathlib import Path

AGENT_FILENAME = "agent.json"
DEFAULTS_FILENAME = "_defaults.json"


def agents_dir() -> Path:
    """agents/ 目录（可用 MOCK_AGENT_AGENTS_DIR 覆盖）。"""
    override = os.environ.get("MOCK_AGENT_AGENTS_DIR")
    if override:
        return Path(override)
    return Path(__file__).resolve().parents[1] / "agents"


def list_agent_dirs() -> list[Path]:
    root = agents_dir()
    if not root.is_dir():
        return []
    return sorted(d for d in root.iterdir() if d.is_dir() and (d / AGENT_FILENAME).is_file())


def load_defaults() -> dict:
    path = agents_dir() / DEFAULTS_FILENAME
    return json.loads(path.read_text(encoding="utf-8"))


def load_agent(agent_dir: Path) -> dict:
    return json.loads((agent_dir / AGENT_FILENAME).read_text(encoding="utf-8"))


def load_define() -> dict:
    """聚合为 define 形态：{"version", "defaults", "instances": [...]}。"""
    defaults = load_defaults()
    instances = [load_agent(d) for d in list_agent_dirs()]
    return {"version": 1, "defaults": defaults, "instances": instances}


def resolve_agent_dir(agent: str) -> Path:
    """按 id 或目录路径定位 Agent 目录。"""
    candidate = Path(agent)
    if candidate.is_dir() and (candidate / AGENT_FILENAME).is_file():
        return candidate
    directory = agents_dir() / agent
    if (directory / AGENT_FILENAME).is_file():
        return directory
    raise FileNotFoundError(f"未找到 Agent 目录：{agent}（agents/{agent}/{AGENT_FILENAME} 不存在）")


AGENT_CODE_FILENAME = "agent.py"
_CLASS_CACHE: dict[tuple, type] = {}


def load_agent_class(agent_dir: Path):
    """加载 Agent 目录中的子类（agent.py 里继承 StubAgentBase 的类）。

    - 目录不含 agent.py → 返回 StubAgentBase（纯配置 Agent，行为与旧版一致）
    - 子类经 importlib 按文件路径加载（缓存键 = 路径 + mtime）
    """
    import importlib.util

    from .agent.base import StubAgentBase

    agent_dir = Path(agent_dir)
    py = agent_dir / AGENT_CODE_FILENAME
    if not py.is_file():
        return StubAgentBase
    cache_key = (str(py.resolve()), py.stat().st_mtime)
    cached = _CLASS_CACHE.get(cache_key)
    if cached is not None:
        return cached
    spec = importlib.util.spec_from_file_location(f"mockagent_agents_{agent_dir.name}", py)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    found = None
    for obj in vars(module).values():
        if isinstance(obj, type) and issubclass(obj, StubAgentBase) and obj is not StubAgentBase:
            found = obj
            break
    if found is None:
        raise TypeError(f"{py} 中未找到 StubAgentBase 子类")
    _CLASS_CACHE[cache_key] = found
    return found


def load_agent_instance(agent_dir: Path):
    """加载并实例化 Agent 子类（注入该目录的 agent.json 与共享基线）。"""
    cls = load_agent_class(agent_dir)
    return cls(load_agent(agent_dir), load_defaults())
