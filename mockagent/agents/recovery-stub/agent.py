# -*- coding: utf-8 -*-
"""业务抢通打桩 Agent（服务恢复通知，Notification-T）。

差异化能力：未声明模板的抢通/恢复类请求推断为服务恢复模板。
"""
from mockagent_engine.agent.base import StubAgentBase

TPL = "Notification-T/network-layer/service-recovery/v1"
_KEYWORDS = ("抢通", "恢复", "倒换")


class RecoveryAgent(StubAgentBase):
    agent_type = "service-recovery"
    domain = "service-assurance"

    def transform_request(self, template_uri, prompt_text):
        if template_uri is None and any(k in prompt_text for k in _KEYWORDS):
            return TPL, prompt_text
        return template_uri, prompt_text
