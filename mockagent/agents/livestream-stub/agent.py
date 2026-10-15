# -*- coding: utf-8 -*-
"""直播打桩 Agent（直播业务质量诊断，Task-T）。

差异化能力：未声明模板的直播质量类请求推断为直播质量诊断模板。
"""
from mockagent_engine.agent.base import StubAgentBase

TPL = "Task-T/network-layer/live-stream-quality/v1"
_KEYWORDS = ("直播", "卡顿", "码率", "推流")


class LiveStreamAgent(StubAgentBase):
    agent_type = "live-stream"
    domain = "network"

    def transform_request(self, template_uri, prompt_text):
        if template_uri is None and any(k in prompt_text for k in _KEYWORDS):
            return TPL, prompt_text
        return template_uri, prompt_text
