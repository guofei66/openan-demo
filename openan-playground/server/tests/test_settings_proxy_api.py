import json

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from openan_debug.config import Settings
from openan_debug.db import init_db, make_engine
from openan_debug.models import RequestLog
from openan_debug.routers import debug_proxy_router
from tests.conftest import auth_header

DEFAULT_URLS = {
    "registryUrl": "http://127.0.0.1:5000",
    "orchestrationUrl": "http://127.0.0.1:5001",
    "executionHostUrl": "http://127.0.0.1:8080",
    "ontologyUrl": "http://127.0.0.1:8787",
}


def _create_user_token(client, admin_token, username="alice"):
    resp = client.post(
        "/api/v1/users",
        json={"username": username, "password": "password-123"},
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 201, resp.text
    resp = client.post("/api/v1/auth/login", json={"username": username, "password": "password-123"})
    assert resp.status_code == 200
    return resp.json()["token"]


def _install_mock_backend(monkeypatch, handler):
    real_client_factory = httpx.AsyncClient

    def fake_client_factory(**kwargs):
        return real_client_factory(transport=httpx.MockTransport(handler), timeout=kwargs.get("timeout"))

    monkeypatch.setattr(debug_proxy_router.httpx, "AsyncClient", fake_client_factory)


def test_settings_get_defaults(client, admin_token):
    resp = client.get("/api/v1/settings/service-urls", headers=auth_header(admin_token))
    assert resp.status_code == 200
    assert resp.json() == DEFAULT_URLS


def test_settings_put_updates_and_get_reflects(client, admin_token):
    headers = auth_header(admin_token)
    resp = client.put(
        "/api/v1/settings/service-urls",
        json={"registryUrl": "https://registry.example.com", "ontologyUrl": "http://10.0.0.5:8787"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    view = resp.json()
    assert view["registryUrl"] == "https://registry.example.com"
    assert view["ontologyUrl"] == "http://10.0.0.5:8787"
    assert view["orchestrationUrl"] == DEFAULT_URLS["orchestrationUrl"]
    after = client.get("/api/v1/settings/service-urls", headers=headers).json()
    assert after == view


def test_settings_put_rejects_non_http_url(client, admin_token):
    resp = client.put(
        "/api/v1/settings/service-urls",
        json={"registryUrl": "ftp://registry.example.com"},
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 422


def test_settings_put_requires_admin(client, admin_token):
    user_token = _create_user_token(client, admin_token)
    resp = client.put(
        "/api/v1/settings/service-urls",
        json={"registryUrl": "http://127.0.0.1:9999"},
        headers=auth_header(user_token),
    )
    assert resp.status_code == 403


def test_settings_get_unauthorized(client):
    assert client.get("/api/v1/settings/service-urls").status_code == 401


def test_init_db_feature_column_default(tmp_path):
    settings = Settings(db_path=tmp_path / "feat.db", admin_password="boot-123")
    engine = make_engine(settings)
    init_db(engine, settings)
    init_db(engine, settings)
    with Session(engine) as session:
        session.add(RequestLog(direction="inbound"))
        session.commit()
    with Session(engine) as session:
        log = session.scalar(select(RequestLog).limit(1))
        assert log.feature == "a2at"


def test_debug_proxy_unknown_feature(client, admin_token):
    resp = client.post(
        "/api/v1/debug-proxy/gateway",
        json={"method": "GET", "path": "/x"},
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 404


def test_debug_proxy_unauthorized(client):
    resp = client.post("/api/v1/debug-proxy/registry", json={"method": "GET", "path": "/x"})
    assert resp.status_code == 401


def test_debug_proxy_rejects_non_root_path(client, admin_token):
    resp = client.post(
        "/api/v1/debug-proxy/registry",
        json={"method": "GET", "path": "http://evil.example.com/x"},
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 422


def test_debug_proxy_rejects_invalid_method(client, admin_token):
    resp = client.post(
        "/api/v1/debug-proxy/registry",
        json={"method": "FETCH", "path": "/x"},
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 422


def test_debug_proxy_json_passthrough(client, admin_token, monkeypatch):
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["method"] = request.method
        return httpx.Response(200, json={"cards": ["a"]})

    _install_mock_backend(monkeypatch, handler)
    resp = client.post(
        "/api/v1/debug-proxy/registry",
        json={"method": "GET", "path": "/rest/v1/registry-center/agent-cards"},
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["status"] == 200
    assert payload["kind"] == "json"
    assert payload["body"] == {"cards": ["a"]}
    assert "latencyMs" in payload
    assert captured["url"] == "http://127.0.0.1:5000/rest/v1/registry-center/agent-cards"
    assert captured["method"] == "GET"
    with Session(client.app.state.engine) as session:
        logs = session.scalars(select(RequestLog).where(RequestLog.feature == "registry")).all()
        assert len(logs) == 1
        assert logs[0].request_body["baseUrl"] == "http://127.0.0.1:5000"
        assert logs[0].direction == "console"
        assert logs[0].user_id is not None


def test_debug_proxy_sse_capture(client, admin_token, monkeypatch):
    async def sse_chunks():
        yield b"data: 1\n\n"
        yield b"data: 2\n\n"

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "text/event-stream"},
            content=sse_chunks(),
        )

    _install_mock_backend(monkeypatch, handler)
    resp = client.post(
        "/api/v1/debug-proxy/ontology",
        json={"method": "POST", "path": "/stream", "body": {"q": 1}},
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["status"] == 200
    assert payload["kind"] == "stream"
    assert "data: 1" in payload["transcript"]
    assert "data: 2" in payload["transcript"]
    with Session(client.app.state.engine) as session:
        logs = session.scalars(select(RequestLog).where(RequestLog.feature == "ontology")).all()
        assert len(logs) == 1


def test_debug_proxy_transport_error(client, admin_token, monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom")

    _install_mock_backend(monkeypatch, handler)
    resp = client.post(
        "/api/v1/debug-proxy/execution",
        json={"method": "GET", "path": "/health"},
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["status"] == 0
    assert payload["kind"] == "error"
    assert payload["body"] == {"error": "boom"}
    history = client.get("/api/v1/history?feature=execution", headers=auth_header(admin_token)).json()
    assert history["total"] == 1
    assert history["items"][0]["responseBody"]["status"] == 0
    assert history["items"][0]["feature"] == "execution"


def test_history_feature_filter_and_detail(client, admin_token, monkeypatch):
    headers = auth_header(admin_token)
    _install_mock_backend(monkeypatch, lambda request: httpx.Response(200, json={"ok": True}))
    client.post("/api/v1/debug-proxy/registry", json={"method": "GET", "path": "/a"}, headers=headers)
    client.post("/api/v1/debug-proxy/ontology", json={"method": "GET", "path": "/b"}, headers=headers)
    listing = client.get("/api/v1/history?feature=registry", headers=headers).json()
    assert listing["total"] == 1
    assert listing["items"][0]["feature"] == "registry"
    detail = client.get(f"/api/v1/history/{listing['items'][0]['id']}", headers=headers).json()
    assert detail["feature"] == "registry"
    other = client.get("/api/v1/history?feature=ontology", headers=headers).json()
    assert other["total"] == 1
    assert other["items"][0]["feature"] == "ontology"


def test_debug_proxy_oversized_json_capped(client, admin_token, monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": "a" * 250_000})

    _install_mock_backend(monkeypatch, handler)
    resp = client.post(
        "/api/v1/debug-proxy/registry",
        json={"method": "GET", "path": "/big"},
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["kind"] in ("json", "text")
    with Session(client.app.state.engine) as session:
        log = session.scalar(select(RequestLog).where(RequestLog.feature == "registry"))
        assert len(json.dumps(log.response_body)) < debug_proxy_router.MAX_RESPONSE_CHARS * 1.1


def test_debug_proxy_stream_content_type_case_insensitive(client, admin_token, monkeypatch):
    async def sse_chunks():
        yield b"data: 1\n\n"

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "Text/Event-Stream"},
            content=sse_chunks(),
        )

    _install_mock_backend(monkeypatch, handler)
    resp = client.post(
        "/api/v1/debug-proxy/registry",
        json={"method": "GET", "path": "/stream"},
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["kind"] == "stream"
    assert "data: 1" in payload["transcript"]
