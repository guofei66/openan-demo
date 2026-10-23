from tests.conftest import auth_header


def test_registry_samples_requires_auth(client):
    assert client.get("/api/v1/registry/samples").status_code == 401


def test_registry_samples_returns_three_samples(client, admin_token):
    resp = client.get("/api/v1/registry/samples", headers=auth_header(admin_token))
    assert resp.status_code == 200
    samples = resp.json()
    assert len(samples) == 3
    keys = [s["key"] for s in samples]
    assert keys == sorted(keys)
    assert len(set(keys)) == len(keys)
    assert "minimal-agent" in keys


def test_registry_sample_cards_are_registry_compliant(client, admin_token):
    resp = client.get("/api/v1/registry/samples", headers=auth_header(admin_token))
    samples = resp.json()
    for sample in samples:
        assert sample["label"]
        assert sample["description"]
        card = sample["card"]
        assert card["name"]
        assert card["version"]
        assert card["description"]
        assert card["provider"]["organization"]
        assert len(card["skills"]) > 0
        for skill in card["skills"]:
            assert skill["id"]
            assert skill["name"]
            assert skill["description"]
        assert len(card["supportedInterfaces"]) > 0
        for interface in card["supportedInterfaces"]:
            assert interface["url"]
            assert interface["protocolBinding"]
