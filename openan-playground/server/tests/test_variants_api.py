from tests.conftest import SUBSCRIBE_INCIDENT_URI, auth_header


def _make_seed(client, headers):
    return client.post(
        "/api/v1/seeds",
        json={"name": "s", "templateUri": SUBSCRIBE_INCIDENT_URI, "seedJson": {"k": "v"}},
        headers=headers,
    ).json()["id"]


def _create_agent(client, headers, name="Secondary Agent"):
    resp = client.post(
        "/api/v1/agents",
        json={"name": name, "organization": "OpenAN", "description": "second"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_import_variants_with_agent_id(client, admin_token):
    headers = auth_header(admin_token)
    agent = _create_agent(client, headers)
    resp = client.post(
        "/api/v1/variants/import",
        json={"agentId": agent["id"], "templateUri": SUBSCRIBE_INCIDENT_URI, "variants": [{"n": 1}]},
        headers=headers,
    )
    assert resp.status_code == 200
    variants = client.get("/api/v1/variants", headers=headers).json()
    assert len(variants) == 1
    assert variants[0]["agentId"] == agent["id"]


def test_import_with_unknown_agent_404(client, admin_token):
    headers = auth_header(admin_token)
    resp = client.post(
        "/api/v1/variants/import",
        json={"agentId": 9999, "templateUri": SUBSCRIBE_INCIDENT_URI, "variants": [{"n": 1}]},
        headers=headers,
    )
    assert resp.status_code == 404
    assert client.get("/api/v1/variants", headers=headers).json() == []


def test_import_with_disabled_agent_409(client, admin_token):
    headers = auth_header(admin_token)
    agent = _create_agent(client, headers)
    resp = client.patch(f"/api/v1/agents/{agent['id']}", json={"enabled": False}, headers=headers)
    assert resp.status_code == 200, resp.text
    resp = client.post(
        "/api/v1/variants/import",
        json={"agentId": agent["id"], "templateUri": SUBSCRIBE_INCIDENT_URI, "variants": [{"n": 1}]},
        headers=headers,
    )
    assert resp.status_code == 409


def test_import_variants(client, admin_token):
    headers = auth_header(admin_token)
    seed_id = _make_seed(client, headers)
    resp = client.post(
        "/api/v1/variants/import",
        json={
            "seedId": seed_id,
            "templateUri": SUBSCRIBE_INCIDENT_URI,
            "variants": [{"incident": {"csn": "A1"}}, {"incident": {"csn": "A2"}}],
        },
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["imported"] == 2
    variants = client.get("/api/v1/variants", headers=headers).json()
    assert len(variants) == 2
    assert variants[0]["seq"] == 0 and variants[1]["seq"] == 1
    assert variants[0]["source"] == "import"


def test_import_with_unknown_seed_404(client, admin_token):
    headers = auth_header(admin_token)
    resp = client.post(
        "/api/v1/variants/import",
        json={"seedId": 9999, "templateUri": SUBSCRIBE_INCIDENT_URI, "variants": [{"n": 1}]},
        headers=headers,
    )
    assert resp.status_code == 404
    assert client.get("/api/v1/variants", headers=headers).json() == []


def test_import_rejects_non_dict_variant(client, admin_token):
    headers = auth_header(admin_token)
    resp = client.post(
        "/api/v1/variants/import",
        json={"templateUri": SUBSCRIBE_INCIDENT_URI, "variants": ["not-dict"]},
        headers=headers,
    )
    assert resp.status_code == 422


def test_import_second_batch_continues_seq(client, admin_token):
    headers = auth_header(admin_token)
    client.post(
        "/api/v1/variants/import",
        json={"templateUri": SUBSCRIBE_INCIDENT_URI, "variants": [{"n": 1}]},
        headers=headers,
    )
    resp = client.post(
        "/api/v1/variants/import",
        json={"templateUri": SUBSCRIBE_INCIDENT_URI, "variants": [{"n": 2}]},
        headers=headers,
    )
    assert resp.json()["firstSeq"] == 1


def test_variant_enable_toggle(client, admin_token):
    headers = auth_header(admin_token)
    client.post(
        "/api/v1/variants/import",
        json={"templateUri": SUBSCRIBE_INCIDENT_URI, "variants": [{"n": 1}]},
        headers=headers,
    )
    variant_id = client.get("/api/v1/variants", headers=headers).json()[0]["id"]
    resp = client.patch(f"/api/v1/variants/{variant_id}", json={"enabled": False}, headers=headers)
    assert resp.json()["enabled"] is False
    variants = client.get("/api/v1/variants", headers=auth_header(admin_token)).json()
    assert variants[0]["enabled"] is False


def test_patch_missing_variant_404(client, admin_token):
    resp = client.patch("/api/v1/variants/9999", json={"enabled": False}, headers=auth_header(admin_token))
    assert resp.status_code == 404


def test_list_variants_requires_auth(client):
    assert client.get("/api/v1/variants").status_code == 401


def test_import_requires_auth(client):
    resp = client.post(
        "/api/v1/variants/import",
        json={"templateUri": SUBSCRIBE_INCIDENT_URI, "variants": [{"n": 1}]},
    )
    assert resp.status_code == 401
