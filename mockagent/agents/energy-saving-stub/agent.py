# -*- coding: utf-8 -*-
"""节能降碳打桩 Agent（无线节能策略，Task-T）。

差异化能力：未声明模板的节能类请求推断为 RAN 节能模板。
"""
from mockagent_engine.agent.base import StubAgentBase

TPL = "Task-T/network-layer/ran-energy-saving/v1"
_KEYWORDS = ("节能", "休眠", "关断", "降碳")


class EnergySavingAgent(StubAgentBase):
    agent_type = "energy-saving"
    domain = "ran"

    def transform_request(self, template_uri, prompt_text):
        if template_uri is None and any(k in prompt_text for k in _KEYWORDS):
            return TPL, prompt_text
        return template_uri, prompt_text
