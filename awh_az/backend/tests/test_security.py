"""Access control: the read key, the admin key, and the routes that used to be open."""
import pytest

import main


@pytest.fixture
def keyed(monkeypatch):
    monkeypatch.setattr(main.settings, "api_key", "read-key")
    monkeypatch.setattr(main.settings, "admin_api_key", "admin-key")


READ = {"X-API-Key": "read-key"}
BOTH = {"X-API-Key": "read-key", "X-Admin-Key": "admin-key"}


def test_api_is_open_while_no_key_is_configured(client):
    # Transitional behaviour: reaches the handler (503 = no Firestore in tests), not 401.
    assert client.get("/stations").status_code == 503


def test_missing_or_wrong_key_is_rejected(client, keyed):
    assert client.get("/stations").status_code == 401
    assert client.get("/stations", headers={"X-API-Key": "nope"}).status_code == 401
    assert client.get("/stations", headers={"X-API-Key": ""}).status_code == 401


def test_correct_key_reaches_the_handler(client, keyed):
    assert client.get("/stations", headers=READ).status_code == 503  # not 401


def test_every_data_route_is_gated(client, keyed):
    for path in ("/impact", "/stations-registry", "/stations/x/readings", "/stations/x/hourly"):
        assert client.get(path).status_code == 401, path
    assert client.post("/export", json={}).status_code == 401


def test_health_and_root_stay_public_and_report_auth_state(client, keyed):
    assert client.get("/").status_code == 200
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["services"]["api_auth"] == "enforced"


def test_health_reports_open_when_unconfigured(client):
    assert client.get("/health").json()["services"]["api_auth"] == "open"


def test_admin_routes_use_the_admin_key_not_the_read_key(client, keyed):
    assert client.get("/admin/stations", headers=READ).status_code == 403
    assert client.get("/admin/stations").status_code == 403


def test_registry_create_and_cache_routes_now_need_the_admin_key(client, keyed):
    body = {"station_name": "junk"}
    assert client.post("/stations-registry", json=body, headers=READ).status_code == 403
    assert client.get("/cache/stats", headers=READ).status_code == 403
    assert client.post("/cache/invalidate", headers=READ).status_code == 403
    assert client.post("/cache/flush", headers=READ).status_code == 403


def test_cache_routes_work_with_both_keys(client, keyed):
    assert client.get("/cache/stats", headers=BOTH).status_code == 200
    assert client.post("/cache/invalidate", headers=BOTH).status_code == 200


def test_admin_key_unset_fails_closed(client, monkeypatch):
    monkeypatch.setattr(main.settings, "admin_api_key", "")
    assert client.post("/cache/flush", headers={"X-Admin-Key": ""}).status_code == 403


def test_cors_preflight_is_not_blocked_by_the_key(client, keyed):
    r = client.options(
        "/stations",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
    )
    assert r.status_code != 401
