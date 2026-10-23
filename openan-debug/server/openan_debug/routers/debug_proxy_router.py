import json
import time

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import SERVICE_URL_DEFAULTS
from ..deps import get_db
from ..models import RequestLog, ServiceSettings
from ..schemas import DebugProxyRequest

router = APIRouter(prefix="/api/v1/debug-proxy", tags=["debug-proxy"])

FEATURE_TO_KEY = {
    "registry": "registry_url",
    "orchestration": "orchestration_url",
    "execution": "execution_host_url",
    "ontology": "ontology_url",
}

STREAM_CONTENT_TYPES = ("text/event-stream", "application/x-ndjson", "application/jsonl")
MAX_RESPONSE_CHARS = 200_000
TRUNCATION_MARKER = "\n...[truncated]"


def _get_url(session: Session, key: str, default: str) -> str:
    row = session.scalar(select(ServiceSettings).where(ServiceSettings.key == key))
    return row.value if row is not None else default


def _truncate(text: str) -> str:
    if len(text) > MAX_RESPONSE_CHARS:
        return text[:MAX_RESPONSE_CHARS] + TRUNCATION_MARKER
    return text


@router.post("/{feature}")
async def debug_proxy(
    feature: str,
    body: DebugProxyRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    if feature not in FEATURE_TO_KEY:
        raise HTTPException(status_code=404, detail="Unknown feature")
    key = FEATURE_TO_KEY[feature]
    base_url = _get_url(db, key, SERVICE_URL_DEFAULTS[key])
    url = base_url.rstrip("/") + body.path
    headers = dict(body.headers or {})
    request_body_log = {
        "method": body.method,
        "path": body.path,
        "headers": body.headers,
        "body": body.body,
        "baseUrl": base_url,
    }
    payload_kwargs = {}
    if body.body is not None:
        payload_kwargs["json"] = body.body
        headers.setdefault("Content-Type", "application/json")
    started = time.monotonic()
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(connect=10, read=body.timeoutSeconds, write=30, pool=30)
        ) as client:
            async with client.stream(body.method, url, headers=headers, **payload_kwargs) as resp:
                content_type = resp.headers.get("content-type", "")
                if any(marker in content_type.lower() for marker in STREAM_CONTENT_TYPES):
                    parts = []
                    size = 0
                    async for chunk in resp.aiter_text():
                        parts.append(chunk)
                        size += len(chunk)
                        if size >= MAX_RESPONSE_CHARS:
                            break
                    result = {
                        "status": resp.status_code,
                        "contentType": content_type,
                        "kind": "stream",
                        "transcript": _truncate("".join(parts)),
                    }
                else:
                    capped = _truncate((await resp.aread()).decode("utf-8", errors="replace"))
                    try:
                        parsed = json.loads(capped)
                        result = {
                            "status": resp.status_code,
                            "contentType": content_type,
                            "kind": "json",
                            "body": parsed,
                        }
                    except ValueError:
                        result = {
                            "status": resp.status_code,
                            "contentType": content_type,
                            "kind": "text",
                            "body": capped,
                        }
    except httpx.HTTPError as e:
        latency_ms = int((time.monotonic() - started) * 1000)
        result = {"status": 0, "kind": "error", "body": {"error": str(e)}}
        response_view = {"error": str(e)}
    else:
        latency_ms = int((time.monotonic() - started) * 1000)
        response_view = result
    db.add(
        RequestLog(
            feature=feature,
            direction="console",
            template_uri=None,
            request_body=request_body_log,
            response_body={"status": result["status"], "response": response_view},
            task_state=None,
            negotiated=False,
            latency_ms=latency_ms,
            user_id=user["id"],
        )
    )
    db.commit()
    return {**result, "latencyMs": latency_ms}
