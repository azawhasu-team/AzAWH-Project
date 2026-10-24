"""Endpoint-level tests for calibrations, quality and alert notifications."""
import itertools
from datetime import datetime, timedelta, timezone

import pytest

import alerting
import main


class _Doc:
    def __init__(self, store, coll, doc_id):
        self.store, self.coll, self.id = store, coll, doc_id

    @property
    def exists(self):
        return self.id in self.store[self.coll]

    def to_dict(self):
        return dict(self.store[self.coll].get(self.id) or {}) if self.exists else None

    def get(self):
        return self

    def set(self, data):
        self.store[self.coll][self.id] = dict(data)

    def delete(self):
        self.store[self.coll].pop(self.id, None)


class _Coll:
    _ids = itertools.count(1)

    def __init__(self, store, name, flt=None):
        self.store, self.name, self.flt = store, name, flt

    def add(self, data):
        doc_id = f"auto{next(self._ids)}"
        self.store[self.name][doc_id] = dict(data)
        return None, _Doc(self.store, self.name, doc_id)

    def document(self, doc_id):
        return _Doc(self.store, self.name, doc_id)

    def where(self, field, _op, value):
        return _Coll(self.store, self.name, (field, value))

    def stream(self):
        for doc_id, data in list(self.store[self.name].items()):
            if self.flt is None or data.get(self.flt[0]) == self.flt[1]:
                yield _Doc(self.store, self.name, doc_id)


class FakeStore:
    def __init__(self):
        self.data = {}

    def collection(self, name):
        self.data.setdefault(name, {})
        return _Coll(self, name)

    def __getitem__(self, name):
        return self.data.setdefault(name, {})


ADMIN = {"X-Admin-Key": "adm"}


@pytest.fixture
def store(monkeypatch):
    s = FakeStore()
    monkeypatch.setattr(main, "db", s)
    monkeypatch.setattr(main.settings, "admin_api_key", "adm")
    monkeypatch.setattr(main.settings, "public_base_url", "https://api.example")
    monkeypatch.setattr(main.settings, "alert_slack_webhook_url", "")
    monkeypatch.setattr(main.settings, "alert_smtp_host", "")
    monkeypatch.setattr(main, "_station_doc_id_exists", lambda *_: True)
    return s


def test_calibration_requires_admin_key_and_round_trips(client, store):
    body = {"date": "2026-10-01", "sensor": "balance", "note": "zeroed"}
    assert client.post("/admin/stations/s1/calibrations", json=body).status_code == 403
    r = client.post("/admin/stations/s1/calibrations", json=body, headers=ADMIN)
    assert r.status_code == 201 and r.json()["sensor"] == "balance"
    listed = client.get("/stations/s1/calibrations").json()
    assert [e["date"] for e in listed] == ["2026-10-01"]
    assert client.get("/stations/other/calibrations").json() == []
    assert client.post("/admin/stations/s1/calibrations", json={**body, "date": "nope"}, headers=ADMIN).status_code == 422
    assert client.delete(f"/admin/calibrations/{r.json()['id']}", headers=ADMIN).status_code == 200
    assert client.get("/stations/s1/calibrations").json() == []
    assert client.delete("/admin/calibrations/missing", headers=ADMIN).status_code == 404


def test_quality_endpoint_returns_days_and_calibrations(client, store, monkeypatch):
    monkeypatch.setattr(main, "_quality_sync", lambda name, days: [{"date": "2026-10-21", "score": 90}])
    client.post("/admin/stations/s1/calibrations", json={"date": "2026-10-01", "sensor": "other"}, headers=ADMIN)
    r = client.get("/stations/s1/quality?days=3").json()
    assert r["days"][0]["score"] == 90 and r["calibrations"][0]["sensor"] == "other"


def _silent_station(minutes=600):
    last = (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()
    return [{"station_name": "s1", "display_name": "Station 1", "metadata": {"last_reading": last}}]


@pytest.fixture
def silent_fleet(monkeypatch):
    async def stations():
        return _silent_station()
    monkeypatch.setattr(main, "get_stations", stations)
    monkeypatch.setattr(main, "_latest_complete_day", lambda name: None)


def test_evaluate_requires_admin_key(client, store, silent_fleet):
    assert client.post("/admin/alerts/evaluate").status_code == 403


def test_evaluate_notifies_once_then_stays_quiet_and_ack_link_works(client, store, silent_fleet):
    first = client.post("/admin/alerts/evaluate", headers=ADMIN).json()
    assert [n["kind"] for n in first["notifications"]] == ["new"]
    assert first["notifications"][0]["channels"] == {"log": "logged"}
    second = client.post("/admin/alerts/evaluate", headers=ADMIN).json()
    assert second["notifications"] == []

    state = client.get("/admin/alerts", headers=ADMIN).json()
    assert state[0]["id"] == "s1|stale" and state[0]["status"] == "open"

    token = alerting.make_token("adm", "s1|stale", "snooze", 4, datetime.now(timezone.utc))
    page = client.get(f"/admin/alerts-action?token={token}")
    assert page.status_code == 200 and "snoozed for 4 h" in page.text
    assert client.get("/admin/alerts", headers=ADMIN).json()[0]["snoozed_until"]


def test_action_link_rejects_bad_tokens_without_a_key(client, store):
    assert client.get("/admin/alerts-action?token=junk").status_code == 400
    forged = alerting.make_token("wrong-secret", "s1|stale", "ack", None, datetime.now(timezone.utc))
    assert client.get(f"/admin/alerts-action?token={forged}").status_code == 400


def test_dry_run_sends_and_saves_nothing(client, store, silent_fleet):
    r = client.post("/admin/alerts/evaluate?dry_run=true", headers=ADMIN).json()
    assert r["notifications"][0]["channels"] == {"dry_run": "not sent"}
    assert store["alert_state"] == {}


def test_manual_ack_api(client, store, silent_fleet):
    client.post("/admin/alerts/evaluate", headers=ADMIN)
    assert client.post("/admin/alerts/ack", json={"id": "s1|stale"}, headers=ADMIN).json()["acked_at"]
    assert client.post("/admin/alerts/ack", json={"id": "nope"}, headers=ADMIN).status_code == 404
    assert client.post("/admin/alerts/snooze", json={"id": "s1|stale", "hours": 5}, headers=ADMIN).status_code == 422
    assert client.post("/admin/alerts/ack", json={"id": "s1|stale"}).status_code == 403
