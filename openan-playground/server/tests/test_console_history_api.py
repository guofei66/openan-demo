import json
import uuid

import httpx

from openan_debug.routers import console_router
from tests.conftest import SUBSCRIBE_INCIDENT_URI, auth_header


def _request_body():
    return {
        "message": {
            "messageId": str(uuid.uuid4()),
            "role": "ROLE_USER",
            "parts": [{"text": "subscribe incident"}],
            "metadata": {
                "templateUri": SUBSCRIBE_INCIDENT_URI,
                "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Notification-T/v1": "prompt",
            },
        }
    }


def _install_mock_backend(monkeypatch, handler):
    real_client_factory = httpx.AsyncClient

    def fake_client_factory(**kwargs):
        return real_client_factory(transport=httpx.MockTransport(handler), timeout=kwargs.get("timeout"))

    monkeypatch.setattr(console_router.httpx, "AsyncClient", fake_client_factory)


def test_console_send_forwards_and_logs(client, admin_token, monkeypatch):
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["headers"] = dict(request.headers)
        captured["body"] = request.read()
        return httpx.Response(200, json={"task": {"id": "t-1", "status": {"state": "TASK_STATE_COMPLETED"}}})

    _install_mock_backend(monkeypatch, handler)
    request_body = _request_body()
    resp = client.post(
        "/api/v1/console/send", json={"request": request_body, "note": "manual"}, headers=auth_header(admin_token)
    )
    assert resp.status_code == 200
    assert resp.json()["response"]["task"]["id"] == "t-1"
    assert captured["url"].endswith("/debug/a2a/message:send")
    assert captured["headers"]["a2a-extensions"].endswith("Notification-T/v1")
    assert json.loads(captured["body"]) == request_body
    history = client.get("/api/v1/history?direction=console", headers=auth_header(admin_token)).json()
    assert history["total"] == 1
    detail = client.get(f"/api/v1/history/{history['items'][0]['id']}", headers=auth_header(admin_token)).json()
    assert detail["userId"] is not None
    assert detail["taskState"] == "TASK_STATE_COMPLETED"


def test_console_send_backend_error_recorded(client, admin_token, monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    _install_mock_backend(monkeypatch, handler)
    resp = client.post("/api/v1/console/send", json={"request": _request_body()}, headers=auth_header(admin_token))
    assert resp.status_code == 200
    assert resp.json()["status"] == 500
    assert resp.json()["response"]["raw"] == "boom"
    history = client.get("/api/v1/history", headers=auth_header(admin_token)).json()
    assert history["total"] == 1


def test_console_send_connect_error_recorded(client, admin_token, monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom")

    _install_mock_backend(monkeypatch, handler)
    resp = client.post("/api/v1/console/send", json={"request": _request_body()}, headers=auth_header(admin_token))
    assert resp.status_code == 200
    assert resp.json()["status"] == 0
    history = client.get("/api/v1/history", headers=auth_header(admin_token)).json()
    assert history["total"] == 1
    assert history["items"][0]["responseBody"]["status"] == 0


def test_console_send_fallback_extension(client, admin_token, monkeypatch):
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["headers"] = dict(request.headers)
        return httpx.Response(200, json={"ok": True})

    _install_mock_backend(monkeypatch, handler)
    request_body = _request_body()
    request_body["message"]["metadata"]["templateUri"] = "Unknown-T/x/v1"
    resp = client.post("/api/v1/console/send", json={"request": request_body}, headers=auth_header(admin_token))
    assert resp.status_code == 200
    assert captured["headers"]["a2a-extensions"] == console_router.DEFAULT_EXTENSION


def test_history_limit_validation(client, admin_token):
    headers = auth_header(admin_token)
    assert client.get("/api/v1/history?limit=-1", headers=headers).status_code == 422


def test_history_limit_upper_bound(client, admin_token):
    headers = auth_header(admin_token)
    assert client.get("/api/v1/history?limit=201", headers=headers).status_code == 422


def test_history_filters_and_detail(client, admin_token, monkeypatch):
    headers = auth_header(admin_token)
    _install_mock_backend(monkeypatch, lambda request: httpx.Response(200, json={"ok": True}))
    client.post(
        "/api/v1/console/send",
        json={"request": _request_body()},
        headers=headers,
    )
    listing = client.get(
        f"/api/v1/history?templateUri={SUBSCRIBE_INCIDENT_URI}", headers=headers
    ).json()
    assert listing["total"] >= 1
    detail_id = listing["items"][0]["id"]
    detail = client.get(f"/api/v1/history/{detail_id}", headers=headers)
    assert detail.status_code == 200
    assert "requestBody" in detail.json()
    assert client.get("/api/v1/history/999999", headers=headers).status_code == 404
