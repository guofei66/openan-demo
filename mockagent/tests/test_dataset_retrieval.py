# -*- coding: utf-8 -*-
"""数据集检索测试：样例读取 / 模板过滤 / 评分阈值 / 标识回填。"""
from mockagent_engine import dataset_retrieval as dr

TPL_LIVE = "Task-T/network-layer/live-stream-quality/v1"
TPL_RCELL = "Task-T/network-layer/wireless-cell-diagnosis/v1"


def test_sample_request_and_response():
    prompt = dr.sample_request(TPL_LIVE)
    text = dr.sample_response(TPL_LIVE)
    assert prompt and len(prompt) > 50
    assert text and len(text) > 20


def test_sample_none_template():
    assert dr.sample_request(None) is None
    assert dr.sample_response(None) is None


def test_search_self_match_scores_high():
    prompt = dr.sample_request(TPL_LIVE)
    hit = dr.search(TPL_LIVE, prompt)
    assert hit, "数据集样例请求应自命中"
    assert hit["meta"]["pairId"].startswith("exp-live")
    assert hit["meta"]["score"] >= 0.9
    assert len(hit["meta"]["candidates"]) == 3


def test_search_filters_by_template():
    prompt = dr.sample_request(TPL_LIVE)
    # 用直播模板的请求去查无线小区模板：跨模板不允许命中
    hit = dr.search(TPL_RCELL, prompt)
    assert hit is None or hit["meta"]["pairId"].startswith("exp-rcell")


def test_search_below_threshold_returns_none():
    assert dr.search(TPL_LIVE, "你好") is None


def test_search_unknown_template_returns_none():
    assert dr.search("Task-T/not-exist/v1", "任何文本") is None


def test_adapt_backfills_ticket_and_isotime():
    request_text = (
        "OSS侧事件流水号 CMCC-GZ-TSCLX-20260925-77777：处理直播卡顿投诉，"
        "事件发生时间 2026-09-25T10:00:00Z。"
    )
    response_text = (
        "1. 诊断结果：成功\n"
        "2. OSS侧事件流水号 CMCC-GZ-TSCLX-20260925-448800：直播间卡顿。\n"
        "3. 发生时间 2026-09-25T09:30:00Z。"
    )
    out = dr.adapt(response_text, request_text)
    assert "CMCC-GZ-TSCLX-20260925-77777" in out
    assert "2026-09-25T10:00:00Z" in out
    assert "448800" not in out


def test_adapt_noop_when_no_identifiers():
    assert dr.adapt("普通响应文本", "") == "普通响应文本"
