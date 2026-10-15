# -*- coding: utf-8 -*-
"""无线域打桩 Agent（无线小区故障诊断，Task-T）。

差异化能力：未声明模板的无线/小区类请求推断为无线小区诊断模板。
"""
from mockagent_engine.agent.base import StubAgentBase

TPL = "Task-T/network-layer/wireless-cell-diagnosis/v1"
_KEYWORDS = ("小区", "切换", "无线", "掉线")


class WirelessDomainAgent(StubAgentBase):
    agent_type = "wireless-domain"
    domain = "ran"

    def transform_request(self, template_uri, prompt_text):
        if template_uri is None and any(k in prompt_text for k in _KEYWORDS):
            return TPL, prompt_text
        return template_uri, prompt_text
