# -*- coding: utf-8 -*-
"""故障诊断打桩 Agent（专线投诉诊断，Task-T）。

差异化能力：未声明模板（templateUri 为 None）的请求按域内关键词推断为
专线投诉诊断模板，使无类型意图也能进入数据集匹配链路。
"""
from mockagent_engine.agent.base import StubAgentBase

TPL = "Task-T/network-layer/private-line-complaint/v1"
_KEYWORDS = ("投诉", "专线", "工单", "故障诊断")


class FaultDiagnosisAgent(StubAgentBase):
    agent_type = "fault-diagnosis"
    domain = "service-assurance"

    def transform_request(self, template_uri, prompt_text):
        if template_uri is None and any(k in prompt_text for k in _KEYWORDS):
            return TPL, prompt_text
        return template_uri, prompt_text
