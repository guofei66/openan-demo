# -*- coding: utf-8 -*-
"""数据集检索：MockAgent 根据请求（templateUri + prompt）在种子/扩写数据集中选择最接近的对。

- 相似度 = 硬标识覆盖率（工单号/流水号/端口/电路号/时间，权重 0.55） + 字符二元组 Dice（0.45）
- 命中后回填标识：把响应对中的同类型标识替换为请求里的真实值（端口/流水号/工单号/电路号/时间，
  多值按出现顺序一一对应），使返回内容与请求成对
- 未命中（无同模板对或分数低于阈值）返回 None，由调用方回退到变体池
"""
import json
import re
import threading
from importlib import resources as importlib_resources

_LOCK = threading.Lock()
_INDEX: list | None = None

DATASET_FILES = (("seed", "demo_dataset.json"), ("expanded", "expanded_dataset.json"))

# 硬标识类型 → 请求/响应中可互证的模式
_ID_PATTERNS = {
    "ticket": re.compile(r"CMCC-[A-Z]{2}-TSCLX-\d{8}-\d{4,8}"),
    "event": re.compile(r"event-id-\d{8}-\d{3,6}"),
    "port": re.compile(r"[A-Z]?\d{3,6}-[A-Za-z\u4e00-\u9fff]{2,6}-[\w\-（）()·]+?-(?:ETH|GE|FE)(?:\.\d{1,4})?(?:\(cvlan=\d+\))?"),
    "circuit": re.compile(r"[\u4e00-\u9fff]{2,4}-[\u4e00-\u9fff]{2,4}(?:GE|FE)\d{2,5}KA/P"),
    "uuid": re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"),
    "isotime": re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|\.\d+Z)?"),
}
_SCORE_W_ID = 0.55
_SCORE_W_BIGRAM = 0.45
_MIN_SCORE = 0.12


def _bigrams(text: str) -> set:
    chars = [c for c in text if c.isalnum() or "\u4e00" <= c <= "\u9fff"]
    return {(chars[i], chars[i + 1]) for i in range(len(chars) - 1)}


def _extract_ids(text: str) -> dict[str, list[str]]:
    ids: dict[str, list[str]] = {}
    for kind, pat in _ID_PATTERNS.items():
        values = []
        for m in pat.finditer(text or ""):
            v = m.group(0)
            if v not in values:
                values.append(v)
        if values:
            ids[kind] = values
    return ids


def _dice(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return 2.0 * len(a & b) / (len(a) + len(b))


def _load() -> list:
    global _INDEX
    with _LOCK:
        if _INDEX is not None:
            return _INDEX
        records = []
        for ds_id, filename in DATASET_FILES:
            try:
                raw = importlib_resources.files("openan_debug").joinpath(filename).read_text(encoding="utf-8")
                data = json.loads(raw)
            except (OSError, ValueError):
                continue
            for p in data.get("pairs", []):
                req = str(p.get("requestPrompt", ""))
                records.append({
                    "pairId": p.get("pairId"),
                    "dataset": ds_id,
                    "protocol": p.get("protocol"),
                    "templateUri": p.get("templateUri"),
                    "scenario": p.get("scenario"),
                    "requestPrompt": req,
                    "responseText": str(p.get("responseText", "")),
                    "artifactName": p.get("responseArtifactName"),
                    "bigrams": _bigrams(req),
                    "ids": _extract_ids(req),
                })
        _INDEX = records
        return _INDEX


def search(template_uri: str | None, prompt_text: str) -> dict | None:
    """返回 {responseText, artifactName, meta} 或 None（未命中，调用方回退变体池）。

    meta 含 dataset/pairId/score/scenario，另附 requestPreview（命中对的请求预览）
    与 candidates（同模板 Top3 候选），便于核查"为什么命中它"。
    """
    if not template_uri or not prompt_text:
        return None
    index = _load()
    req_bigrams = _bigrams(prompt_text)
    req_ids = _extract_ids(prompt_text)
    req_id_total = sum(len(v) for v in req_ids.values())
    scored: list[tuple[float, dict]] = []
    for rec in index:
        if rec["templateUri"] != template_uri:
            continue
        if req_id_total:
            hit = 0
            for kind, values in req_ids.items():
                cand_values = rec["ids"].get(kind, [])
                for v in values:
                    if v in cand_values:
                        hit += 1
                        break
            id_cov = hit / req_id_total
        else:
            id_cov = 0.0
        score = _SCORE_W_ID * id_cov + _SCORE_W_BIGRAM * _dice(req_bigrams, rec["bigrams"])
        if score > 0:
            scored.append((score, rec))
    if not scored:
        return None
    scored.sort(key=lambda item: item[0], reverse=True)
    best_score, best = scored[0]
    if best_score < _MIN_SCORE:
        return None
    return {
        "responseText": best["responseText"],
        "artifactName": best["artifactName"],
        "meta": {
            "pairId": best["pairId"],
            "dataset": best["dataset"],
            "score": round(best_score, 4),
            "scenario": best["scenario"],
            "requestPreview": best["requestPrompt"][:120],
            "candidates": [
                {"pairId": rec["pairId"], "dataset": rec["dataset"], "score": round(score, 4), "scenario": rec["scenario"]}
                for score, rec in scored[:3]
            ],
        },
    }


def sample_response(template_uri: str | None) -> str | None:
    """同模板任一数据对的响应文本（作为 LLM 模式的预期输出格式锚）；无则 None。"""
    if not template_uri:
        return None
    for rec in _load():
        if rec["templateUri"] == template_uri and rec["responseText"].strip():
            return rec["responseText"]
    return None


def sample_request(template_uri: str | None) -> str | None:
    """同模板任一数据对的请求全文（供工作流远端步骤构造 A2A-T prompt）；无则 None。"""
    if not template_uri:
        return None
    for rec in _load():
        if rec["templateUri"] == template_uri and rec["requestPrompt"].strip():
            return rec["requestPrompt"]
    return None


def adapt(response_text: str, request_text: str) -> str:
    """标识回填：请求中出现某类型标识时，用请求值替换响应中的同类型标识（多值按顺序对应）。"""
    if not response_text or not request_text:
        return response_text
    req_ids = _extract_ids(request_text)
    resp_ids = _extract_ids(response_text)
    out = response_text
    for kind, req_values in req_ids.items():
        resp_values = resp_ids.get(kind, [])
        if not resp_values:
            continue
        for i, rv in enumerate(resp_values):
            replacement = req_values[i] if i < len(req_values) else req_values[-1]
            if replacement and replacement != rv:
                out = out.replace(rv, replacement)
    return out
