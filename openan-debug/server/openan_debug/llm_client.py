"""MockAgent LLM 模式客户端（参考编排中心 samples/agents 实现）。

- 提示词：samples/agents 的 simulator 角色模板（"You are a X Agent simulator in the
  telecommunications field..."）+ 同模板数据集样例作为预期输出格式锚 + 语言提示；
- 调用：OpenAI 兼容 /chat/completions（GenericLLM.ask_llm 等价实现，Bearer 鉴权，
  choices[0].message.content 提取，maxAttempts 重试）；
- 语义：LLM 模式下模型按模板格式生成内容回复；调用失败自动回落桩数据（数据集→变体池）。
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 120.0


@dataclass(frozen=True)
class LlmConfig:
    """实例 LLM 连接方案（来源 mock_agent_define.json defaults/instance.llm 合并）。"""

    enabled: bool
    provider: str
    base_url: str
    model: str
    api_key: str
    max_attempts: int = 1
    language: str = "zh-CN"


def from_define(llm: dict | None) -> LlmConfig | None:
    if not llm or not llm.get("enabled"):
        return None
    import os

    return LlmConfig(
        enabled=True,
        provider=str(llm.get("provider", "openai")),
        base_url=str(llm.get("baseUrl", "")).rstrip("/"),
        model=str(llm.get("model", "")),
        api_key=os.environ.get(llm.get("apiKeyEnv") or "", "dummy") or "dummy",
        max_attempts=max(1, int(llm.get("maxAttempts", 1))),
        language=str(llm.get("language", "zh-CN")),
    )


def build_simulator_prompt(
    agent_name: str,
    template_uri: str | None,
    prompt_text: str,
    language: str = "zh-CN",
    sample_response: str | None = None,
) -> str:
    """构造 simulator 生成提示词（对齐 samples/agents/negotiation_base_agent._execute_task）。"""
    role = f"You are the {agent_name} simulator in the telecommunications field."
    scope = (
        "Based on the received task, simulate a focused response using details from the task "
        "description. Keep the response directly tied to the task scope."
    )
    template_line = f"Template: {template_uri}" if template_uri else "Template: (unspecified)"
    sample_block = ""
    if sample_response:
        sample_block = f"\n# Expected Output Format (sample for the same template)\n{sample_response}\n"
    lang_hint = "请用中文回复。" if str(language).lower().startswith("zh") else "Respond in English."
    return f"""# Role
{role}
{scope}

# {template_line}
{sample_block}
# Task content
{prompt_text}

# Output Requirements
- Generate a concrete, realistic telecom-scenario response consistent with the task details.
- Follow the expected output structure of the template (use the sample above as the format anchor when provided).
- Output only the response content itself, without extra explanations.
{lang_hint}"""


def ask_llm(cfg: LlmConfig, prompt: str, timeout: float = DEFAULT_TIMEOUT, transport: httpx.BaseTransport | None = None) -> str:
    """OpenAI 兼容 chat/completions 调用；返回回答文本，失败抛异常（由调用方回落桩数据）。"""
    if not cfg.base_url:
        raise RuntimeError("LLM baseUrl is not configured")
    url = f"{cfg.base_url}/chat/completions"
    headers = {"Authorization": f"Bearer {cfg.api_key}", "Content-Type": "application/json"}
    body = {
        "model": cfg.model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "temperature": 0.3,
    }
    last_error: Exception | None = None
    for attempt in range(1, cfg.max_attempts + 1):
        try:
            with httpx.Client(timeout=timeout, transport=transport) as client:
                resp = client.post(url, headers=headers, json=body)
                resp.raise_for_status()
                data = resp.json()
            content = (
                data.get("choices", [{}])[0].get("message", {}).get("content")
                if isinstance(data, dict) and data.get("choices")
                else None
            )
            if not content or not str(content).strip():
                raise RuntimeError(f"LLM returned empty content: {str(data)[:200]}")
            return str(content).strip()
        except Exception as error:  # noqa: BLE001 - 统一回落
            last_error = error
            logger.warning("LLM call attempt %s/%s failed: %s", attempt, cfg.max_attempts, error)
    raise RuntimeError(f"LLM call failed after {cfg.max_attempts} attempt(s): {last_error}")
