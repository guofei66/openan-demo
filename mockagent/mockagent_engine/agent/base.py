# -*- coding: utf-8 -*-
"""打桩 Agent 基类：引擎提供默认行为，具体 Agent 在 agents/<id>/agent.py 中继承并重写钩子，
以承载差异化能力（域内意图→模板推断、请求/响应定制、运行时扩展等）。"""
from __future__ import annotations


class StubAgentBase:
    """所有打桩 Agent 的基类。

    生命周期：agents/<id>/agent.py 定义子类 → agent_registry.load_agent_class 加载 →
    standalone_agent 实例化（注入 instance/defaults 配置）→ executor 在桩选择链路中调用钩子。

    可重写钩子：
    - build_runtime(runtime): 实例启动前扩展/修改运行时（executor 可见）
    - transform_request(template_uri, prompt_text): 请求侧差异化，返回 (template_uri, prompt_text)
    - transform_reply(template_uri, prompt_text, reply): 响应侧差异化，返回 reply 字典
    - capabilities(): 能力声明（展示/管理用）

    默认实现均为恒等/透传——纯配置 Agent（不含 agent.py）行为与旧版完全一致。
    """

    agent_type = "generic"
    domain: str | None = None

    def __init__(self, instance: dict | None = None, defaults: dict | None = None):
        self.instance = instance or {}
        self.defaults = defaults or {}

    # ---- 配置便捷属性 ----
    @property
    def id(self) -> str:
        return str(self.instance.get("id", ""))

    @property
    def display_name(self) -> str:
        return str(self.instance.get("agentName") or self.instance.get("name") or self.id)

    @property
    def dataset_templates(self) -> list | None:
        return self.instance.get("datasetTemplates")

    # ---- 钩子（默认透传）----
    def build_runtime(self, runtime: dict) -> dict:
        """实例启动前修改运行时字典（executor/_select_stub 可见），默认原样返回。"""
        return runtime

    def transform_request(self, template_uri: str | None, prompt_text: str):
        """请求侧钩子：返回 (template_uri, prompt_text)。默认恒等。"""
        return template_uri, prompt_text

    def transform_reply(self, template_uri: str | None, prompt_text: str, reply: dict | None):
        """响应侧钩子：reply 为 {artifactPrompt, artifactName, ...}，返回处理后的 reply（None 表示维持原结果）。默认原样返回。"""
        return reply

    def capabilities(self) -> list[str]:
        """能力声明；子类按需覆盖。"""
        caps = ["dataset-matching", "variant-pool"]
        if (self.instance.get("llm") or {}).get("enabled"):
            caps.append("llm-generation")
        if (self.instance.get("workflow") or {}).get("enabled"):
            caps.append("workflow-orchestration")
        return caps
