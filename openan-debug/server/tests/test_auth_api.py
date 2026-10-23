from openan_debug.auth import create_token
from tests.conftest import auth_header


def test_login_success_and_me(client):
    resp = client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin-pass-01"})
    assert resp.status_code == 200
    token = resp.json()["token"]
    me = client.get("/api/v1/auth/me", headers=auth_header(token))
    assert me.status_code == 200
    assert me.json() == {"username": "admin", "role": "admin", "id": 1}


def test_login_wrong_password(client):
    resp = client.post("/api/v1/auth/login", json={"username": "admin", "password": "nope"})
    assert resp.status_code == 401


def test_api_requires_token(client):
    assert client.get("/api/v1/users").status_code == 401
    assert client.get("/api/v1/auth/me", headers={"Authorization": "Bearer bad"}).status_code == 401


def test_admin_creates_and_disables_user(client, admin_token):
    headers = auth_header(admin_token)
    resp = client.post(
        "/api/v1/users",
        json={"username": "tester", "password": "test-pass-01", "role": "user"},
        headers=headers,
    )
    assert resp.status_code == 201
    user_id = resp.json()["id"]
    users = client.get("/api/v1/users", headers=headers).json()
    assert any(u["username"] == "tester" for u in users)
    resp = client.patch(f"/api/v1/users/{user_id}", json={"enabled": False}, headers=headers)
    assert resp.status_code == 200
    login = client.post("/api/v1/auth/login", json={"username": "tester", "password": "test-pass-01"})
    assert login.status_code == 401


def test_non_admin_forbidden(client, admin_token):
    headers = auth_header(admin_token)
    client.post("/api/v1/users", json={"username": "u2", "password": "p2w123456", "role": "user"}, headers=headers)
    token = client.post("/api/v1/auth/login", json={"username": "u2", "password": "p2w123456"}).json()["token"]
    assert client.get("/api/v1/users", headers=auth_header(token)).status_code == 403


def test_expired_token_rejected(client):
    token = create_token("admin", "admin", "test-secret", -1)
    assert client.get("/api/v1/auth/me", headers=auth_header(token)).status_code == 401


def test_disabled_user_token_rejected(client, admin_token):
    headers = auth_header(admin_token)
    resp = client.post(
        "/api/v1/users",
        json={"username": "duser", "password": "dis-pass-01", "role": "user"},
        headers=headers,
    )
    user_id = resp.json()["id"]
    token = client.post("/api/v1/auth/login", json={"username": "duser", "password": "dis-pass-01"}).json()["token"]
    client.patch(f"/api/v1/users/{user_id}", json={"enabled": False}, headers=headers)
    assert client.get("/api/v1/auth/me", headers=auth_header(token)).status_code == 401


def test_demoted_admin_loses_privileges(client, admin_token):
    headers = auth_header(admin_token)
    resp = client.post(
        "/api/v1/users",
        json={"username": "demoted", "password": "dem-pass-01", "role": "admin"},
        headers=headers,
    )
    user_id = resp.json()["id"]
    token = client.post("/api/v1/auth/login", json={"username": "demoted", "password": "dem-pass-01"}).json()["token"]
    resp = client.patch(f"/api/v1/users/{user_id}", json={"role": "user"}, headers=headers)
    assert resp.status_code == 200
    assert client.get("/api/v1/users", headers=auth_header(token)).status_code == 403


def test_patch_password_change(client, admin_token):
    headers = auth_header(admin_token)
    resp = client.post(
        "/api/v1/users",
        json={"username": "pwuser", "password": "old-pass-01", "role": "user"},
        headers=headers,
    )
    user_id = resp.json()["id"]
    resp = client.patch(f"/api/v1/users/{user_id}", json={"password": "new-pass-123"}, headers=headers)
    assert resp.status_code == 200
    assert client.post("/api/v1/auth/login", json={"username": "pwuser", "password": "new-pass-123"}).status_code == 200
    assert client.post("/api/v1/auth/login", json={"username": "pwuser", "password": "old-pass-01"}).status_code == 401


def test_duplicate_username_conflict(client, admin_token):
    headers = auth_header(admin_token)
    resp = client.post(
        "/api/v1/users",
        json={"username": "dupuser", "password": "dup-pass-01", "role": "user"},
        headers=headers,
    )
    assert resp.status_code == 201
    resp = client.post(
        "/api/v1/users",
        json={"username": "dupuser", "password": "dup-pass-02", "role": "user"},
        headers=headers,
    )
    assert resp.status_code == 409
