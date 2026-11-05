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
    monkeypatch.setattr(main, "_latest_complete_day", lambda name, *a, **k: None)


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


# ---------------------------------------------------------------------------
# incremental hourly read for alert runs
# ---------------------------------------------------------------------------
def _fake_hourly(calls):
    """Stands in for the Firestore-backed computation: one row per hour touched
    by [start, end], valued by its hour so full and incremental reads compare."""
    def fake(name, start, end):
        calls.append((start, end))
        rows, t = [], start.replace(minute=0, second=0, microsecond=0)
        while t <= end:
            rows.append({"hour": t.strftime("%Y-%m-%dT%H:00:00Z"), "v": t.strftime("%d%H")})
            t += timedelta(hours=1)
        return {"data": rows}
    return fake


def test_alert_hourly_reads_only_new_hours_after_the_first_run(monkeypatch):
    calls = []
    monkeypatch.setattr(main, "_compute_hourly_aggregation_sync", _fake_hourly(calls))
    main._ALERT_HOURLY_CACHE.clear()
    t0 = datetime(2026, 11, 5, 10, 7, tzinfo=timezone.utc)
    first = main._alert_hourly("s", t0)
    assert calls[0] == (t0 - timedelta(days=main.ALERT_ANALYSIS_DAYS), t0)   # full window once

    t1 = t0 + timedelta(minutes=30)
    second = main._alert_hourly("s", t1)
    start, end = calls[1]
    assert start == datetime(2026, 11, 5, 9, 58, tzinfo=timezone.utc) and end == t1   # from 2 min before the 10:00 hour
    # same hours as a from-scratch read, no duplicates
    assert [r["hour"] for r in second["data"]] == [r["hour"] for r in first["data"]]


def test_alert_hourly_rolls_forward_and_trims_old_hours(monkeypatch):
    calls = []
    monkeypatch.setattr(main, "_compute_hourly_aggregation_sync", _fake_hourly(calls))
    main._ALERT_HOURLY_CACHE.clear()
    t0 = datetime(2026, 11, 5, 10, 7, tzinfo=timezone.utc)
    main._alert_hourly("s", t0)
    t1 = t0 + timedelta(hours=3, minutes=30)
    out = main._alert_hourly("s", t1)
    hours = [r["hour"] for r in out["data"]]
    assert hours == sorted(set(hours))
    assert hours[-1] == "2026-11-05T13:00:00Z"                                  # new hours picked up
    assert hours[0] >= (t1 - timedelta(days=main.ALERT_ANALYSIS_DAYS)).replace(minute=0).strftime("%Y-%m-%dT%H:00:00Z")
    assert calls[-1][0] == datetime(2026, 11, 5, 9, 58, tzinfo=timezone.utc)    # only from the last partial hour


def test_alert_hourly_does_full_read_after_long_idle_and_keeps_cache_on_failure(monkeypatch):
    calls = []
    monkeypatch.setattr(main, "_compute_hourly_aggregation_sync", _fake_hourly(calls))
    main._ALERT_HOURLY_CACHE.clear()
    t0 = datetime(2026, 11, 5, 10, 7, tzinfo=timezone.utc)
    main._alert_hourly("s", t0)
    later = t0 + timedelta(days=5)
    main._alert_hourly("s", later)
    assert calls[-1][0] == later - timedelta(days=main.ALERT_ANALYSIS_DAYS)     # too old to extend: full window

    cached = dict(main._ALERT_HOURLY_CACHE["s"])
    def boom(*a):
        raise RuntimeError("firestore down")
    monkeypatch.setattr(main, "_compute_hourly_aggregation_sync", boom)
    with pytest.raises(RuntimeError):
        main._alert_hourly("s", later + timedelta(minutes=30))
    assert main._ALERT_HOURLY_CACHE["s"] == cached                              # unchanged, retried next run
