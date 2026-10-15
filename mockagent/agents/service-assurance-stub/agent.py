# -*- coding: utf-8 -*-
"""业务保障打桩 Agent（工作流编排宿主）。

差异化能力：
- 工作流宿主（agent.json workflow.enabled）：执行内置 PSOP，
  SELF_LOOP 本地生成，普通步骤经 workflow-engine-sdk 派发到其它打桩实例；
- 未声明模板的保障类请求推断为专线投诉诊断模板（回退链路仍可用）。
"""
from mockagent_engine.agent.base import StubAgentBase

TPL = "Task-T/network-layer/private-line-complaint/v1"
_KEYWORDS = ("保障", "投诉", "端到端")


class ServiceAssuranceAgent(StubAgentBase):
    agent_type = "workflow-host"
    domain = "service-assurance"

    def transform_request(self, template_uri, prompt_text):
        if template_uri is None and any(k in prompt_text for k in _KEYWORDS):
            return TPL, prompt_text
        return template_uri, prompt_text

    def capabilities(self) -> list[str]:
        return [*super().capabilities(), "multi-agent-orchestration"]
