# -*- coding: utf-8 -*-
"""LLM 模式测试：配置合并 / 提示词构造 / OpenAI 兼容调用（MockTransport，不发真实请求）。"""
import httpx
import pytest

from mockagent_engine import llm_client as lc


def test_from_define_disabled_returns_none():
    assert lc.from_define(None) is None
    assert lc.from_define({"enabled": False}) is None


def test_from_define_reads_api_key_env(monkeypatch):
    monkeypatch.setenv("MY_TEST_KEY", "sk-test-123")
    cfg = lc.from_define({
        "enabled": True,
        "provider": "openai",
        "baseUrl": "http://127.0.0.1:8000/v1/",
        "model": "qwen2.5-7b-instruct",
        "apiKeyEnv": "MY_TEST_KEY",
        "maxAttempts": 2,
    })
    assert cfg.enabled
    assert cfg.base_url == "http://127.0.0.1:8000/v1"
    assert cfg.api_key == "sk-test-123"
    assert cfg.max_attempts == 2


def test_build_simulator_prompt():
    prompt = lc.build_simulator_prompt(
        "直播打桩 Agent",
        "Task-T/network-layer/live-stream-quality/v1",
        "直播间卡顿",
        sample_response="1. 诊断结果：成功",
    )
    assert "直播打桩 Agent simulator" in prompt
    assert "Template: Task-T/network-layer/live-stream-quality/v1" in prompt
    assert "1. 诊断结果：成功" in prompt, "样例应作为输出格式锚"
    assert "请用中文回复" in prompt
    assert "直播间卡顿" in prompt


def test_build_simulator_prompt_english_hint():
    prompt = lc.build_simulator_prompt("Agent", None, "task", language="en-US")
    assert "Template: (unspecified)" in prompt
    assert "Respond in English." in prompt


def _ok_transport():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": [{"message": {"content": " 1. 诊断结果：成功\n2. … "}}]})

    return httpx.MockTransport(handler)


def test_ask_llm_success_extracts_content():
    cfg = lc.LlmConfig(enabled=True, provider="openai", base_url="http://llm.local/v1", model="m1", api_key="k")
    assert lc.ask_llm(cfg, "prompt", transport=_ok_transport()) == "1. 诊断结果：成功\n2. …"


def test_ask_llm_sends_openai_body():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("Authorization")
        seen["body"] = request.read()
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    cfg = lc.LlmConfig(enabled=True, provider="openai", base_url="http://llm.local/v1", model="m1", api_key="k")
    assert lc.ask_llm(cfg, "prompt", transport=httpx.MockTransport(handler)) == "ok"
    assert seen["url"] == "http://llm.local/v1/chat/completions"
    assert seen["auth"] == "Bearer k"
    assert b'"model":"m1"' in seen["body"].replace(b" ", b"")


def test_ask_llm_retries_then_raises():
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(500, text="boom")

    cfg = lc.LlmConfig(enabled=True, provider="openai", base_url="http://llm.local/v1", model="m1", api_key="k", max_attempts=3)
    with pytest.raises(RuntimeError):
        lc.ask_llm(cfg, "prompt", timeout=5, transport=httpx.MockTransport(handler))
    assert calls["n"] == 3


def test_ask_llm_empty_content_raises():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": [{"message": {"content": "   "}}]})

    cfg = lc.LlmConfig(enabled=True, provider="openai", base_url="http://llm.local/v1", model="m1", api_key="k")
    with pytest.raises(RuntimeError):
        lc.ask_llm(cfg, "prompt", timeout=5, transport=httpx.MockTransport(handler))


def test_ask_llm_requires_base_url():
    cfg = lc.LlmConfig(enabled=True, provider="openai", base_url="", model="m1", api_key="k")
    with pytest.raises(RuntimeError):
        lc.ask_llm(cfg, "prompt")
