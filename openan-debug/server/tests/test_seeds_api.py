from tests.conftest import SUBSCRIBE_INCIDENT_URI, auth_header


def test_seed_crud(client, admin_token):
    headers = auth_header(admin_token)
    resp = client.post(
        "/api/v1/seeds",
        json={"name": "s1", "templateUri": SUBSCRIBE_INCIDENT_URI, "seedJson": {"k": "v"}, "description": "d"},
        headers=headers,
    )
    assert resp.status_code == 201
    seed_id = resp.json()["id"]
    assert resp.json()["templateUri"] == SUBSCRIBE_INCIDENT_URI
    resp = client.get("/api/v1/seeds", headers=headers)
    assert any(s["id"] == seed_id for s in resp.json())
    resp = client.patch(f"/api/v1/seeds/{seed_id}", json={"name": "s1b"}, headers=headers)
    assert resp.json()["name"] == "s1b"
    resp = client.delete(f"/api/v1/seeds/{seed_id}", headers=headers)
    assert resp.status_code == 204
    assert client.get("/api/v1/seeds", headers=headers).json() == []


def test_seed_requires_auth(client):
    assert client.get("/api/v1/seeds").status_code == 401


def test_seed_invalid_json_rejected(client, admin_token):
    headers = auth_header(admin_token)
    resp = client.post(
        "/api/v1/seeds",
        json={"name": "s", "templateUri": SUBSCRIBE_INCIDENT_URI, "seedJson": "not-a-dict"},
        headers=headers,
    )
    assert resp.status_code == 422


def test_seed_patch_and_delete_missing_404(client, admin_token):
    headers = auth_header(admin_token)
    assert client.patch("/api/v1/seeds/9999", json={"name": "x"}, headers=headers).status_code == 404
    assert client.delete("/api/v1/seeds/9999", headers=headers).status_code == 404
