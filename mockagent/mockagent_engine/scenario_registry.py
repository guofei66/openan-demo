# -*- coding: utf-8 -*-
"""场景注册表：每个场景一个目录，打包三类配置——

- scenario.json  故事线描述（背景/角色/阶段/预期结果）
- workflow.json  本场景的 PSOP 工作流文件
- agents.json    场景需要的智能体清单（引用 agents/<id>/，可带场景级覆盖）

目录布局 / layout:
    scenarios/<scenario-id>/
    ├── scenario.json
    ├── workflow.json
    └── agents.json
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

SCENARIO_FILENAME = "scenario.json"
SCENARIO_WORKFLOW_FILENAME = "workflow.json"
SCENARIO_AGENTS_FILENAME = "agents.json"

REQUIRED_FILES = (SCENARIO_FILENAME, SCENARIO_WORKFLOW_FILENAME, SCENARIO_AGENTS_FILENAME)


def scenarios_dir() -> Path:
    """项目根 scenarios/ 目录（可用环境变量 MOCK_AGENT_SCENARIOS_DIR 覆盖）。"""
    import os

    override = os.environ.get("MOCK_AGENT_SCENARIOS_DIR")
    return Path(override) if override else Path(__file__).resolve().parents[1] / "scenarios"


def list_scenario_dirs() -> list[Path]:
    """全部场景目录（含三个必需配置文件的目录才有效）。"""
    root = scenarios_dir()
    if not root.is_dir():
        return []
    return sorted(
        d for d in root.iterdir()
        if d.is_dir() and all((d / f).is_file() for f in REQUIRED_FILES)
    )


def resolve_scenario_dir(scenario: str) -> Path:
    """按场景 id 或目录路径定位场景目录。"""
    candidate = Path(scenario)
    if candidate.is_dir() and all((candidate / f).is_file() for f in REQUIRED_FILES):
        return candidate
    directory = scenarios_dir() / scenario
    if directory.is_dir() and all((directory / f).is_file() for f in REQUIRED_FILES):
        return directory
    raise FileNotFoundError(
        f"未找到场景目录：{scenario}（scenarios/{scenario}/ 下需包含 {'、'.join(REQUIRED_FILES)}）"
    )


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def load_storyline(scenario_dir: Path) -> dict:
    """加载故事线描述配置（scenario.json）。"""
    return _read_json(Path(scenario_dir) / SCENARIO_FILENAME)


def load_scenario_workflow(scenario_dir: Path) -> dict:
    """加载本场景的 PSOP 工作流文件（workflow.json）。"""
    return _read_json(Path(scenario_dir) / SCENARIO_WORKFLOW_FILENAME)


def load_scenario_agents(scenario_dir: Path) -> dict:
    """加载场景智能体清单（agents.json），并校验引用的 Agent 均已定义。

    返回 {"scenarioId": ..., "agents": [{"id", "role", "required", ...}], "overrides": {...}}
    任一 id 在 agents/ 下不存在 → FileNotFoundError。
    """
    from . import agent_registry

    data = _read_json(Path(scenario_dir) / SCENARIO_AGENTS_FILENAME)
    agents = data.get("agents") or []
    if not isinstance(agents, list) or not agents:
        raise ValueError(f"{Path(scenario_dir) / SCENARIO_AGENTS_FILENAME}：agents 列表不能为空")
    missing = []
    for entry in agents:
        agent_id = entry.get("id") if isinstance(entry, dict) else None
        try:
            agent_registry.resolve_agent_dir(str(agent_id))
        except FileNotFoundError:
            missing.append(str(agent_id))
    if missing:
        raise FileNotFoundError(f"场景引用了未定义的 Agent：{', '.join(missing)}（agents/ 下不存在）")
    return data


def load_scenario(scenario_dir: Path) -> dict:
    """加载完整场景（故事线 + 工作流 + 智能体清单）；三类配置缺一不可。"""
    scenario_dir = Path(scenario_dir)
    missing = [f for f in REQUIRED_FILES if not (scenario_dir / f).is_file()]
    if missing:
        raise FileNotFoundError(f"场景 {scenario_dir.name} 缺少配置文件：{', '.join(missing)}")
    return {
        "scenario": load_storyline(scenario_dir),
        "workflow": load_scenario_workflow(scenario_dir),
        "agents": load_scenario_agents(scenario_dir),
    }


def list_scenarios() -> list[dict]:
    """场景摘要列表（控制台/接口用）。"""
    result = []
    for d in list_scenario_dirs():
        try:
            story = load_storyline(d)
            agents_cfg = load_scenario_agents(d)
        except (OSError, ValueError, FileNotFoundError) as error:
            logger.warning("invalid scenario dir %s: %s", d, error)
            continue
        result.append({
            "id": story.get("id") or d.name,
            "name": story.get("name", ""),
            "nameEn": story.get("nameEn", ""),
            "description": story.get("description", ""),
            "workflowId": (story.get("entry") or {}).get("workflowId"),
            "phaseCount": len((story.get("storyline") or {}).get("phases") or []),
            "agents": [
                {"id": a.get("id"), "role": a.get("role", "participant"), "required": bool(a.get("required", True))}
                for a in agents_cfg.get("agents", [])
            ],
        })
    return result
