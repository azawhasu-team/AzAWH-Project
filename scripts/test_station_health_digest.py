"""Tests for station_health_digest.py: classification, state diffing, LLM guardrail."""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import station_health_digest as d  # noqa: E402

NOW = datetime(2026, 10, 6, 12, 0, tzinfo=timezone.utc)


def row(hours_ago=0.1, rows=100, **overrides):
    r = {"station_name": "s", "last_time": None if hours_ago is None else NOW - timedelta(hours=hours_ago),
         "rows_24h": rows}
    for c in set(d.FROZEN_CHECK) | set(d.DEAD_CHECK) | set(d.METER_CHECK):
        r[f"nn_{c}"] = rows
        r[f"d_{c}"] = rows  # many distinct values = healthy
    r.update(overrides)
    return r


def test_never_reported():
    assert d.classify(row(hours_ago=None), NOW) == ("never", [])


def test_silent_station_gets_no_sensor_issues():
    assert d.classify(row(hours_ago=48, d_temperature=1), NOW) == ("silent", [])


def test_healthy_live_station():
    assert d.classify(row(), NOW) == ("live", [])


def test_frozen_sensor():
    status, issues = d.classify(row(d_temperature=1), NOW)
    assert status == "live" and any("temperature sensor frozen" in i for i in issues)


def test_dead_sensor():
    _, issues = d.classify(row(nn_weight=0, d_weight=0), NOW)
    assert any("weight sensor dead" in i for i in issues)


def test_energy_only_meter_is_healthy():
    # DEM730P over RS485: power and voltage always null, energy present
    r = row(nn_power=0, d_power=0, nn_voltage=0, d_voltage=0)
    assert d.classify(r, NOW) == ("live", [])


def test_meter_dead_when_all_three_missing():
    r = row(nn_power=0, nn_voltage=0, nn_energy=0)
    assert any("power meter dead" in i for i in d.classify(r, NOW)[1])


def test_too_few_rows_skips_sensor_checks():
    assert d.classify(row(rows=5, d_temperature=1), NOW) == ("live", [])


def snap(status, issues=(), hours=None):
    return {"status": status, "issues": list(issues), "hours_silent": hours}


def test_diff_no_change_is_empty():
    s = {"a": snap("live"), "b": snap("silent", hours=900)}
    assert d.diff_state(s, s) == []


def test_diff_went_silent_and_recovered():
    out = d.diff_state({"a": snap("live")}, {"a": snap("silent", hours=8.0)})
    assert [f["type"] for f in out] == ["went_silent"]
    out = d.diff_state({"a": snap("silent")}, {"a": snap("live")})
    assert [f["type"] for f in out] == ["recovered"]


def test_diff_new_sensor_issue_reported_once():
    prev = {"a": snap("live")}
    cur = {"a": snap("live", ["temperature sensor frozen (x)"])}
    assert [f["type"] for f in d.diff_state(prev, cur)] == ["sensor"]
    assert d.diff_state(cur, cur) == []


def test_diff_all_live_stations_silent_flags_global():
    prev = {"a": snap("live"), "b": snap("live")}
    cur = {"a": snap("silent", hours=7.0), "b": snap("silent", hours=7.0)}
    assert any(f["type"] == "global" for f in d.diff_state(prev, cur))


def test_single_live_station_silent_is_not_global():
    out = d.diff_state({"a": snap("live")}, {"a": snap("silent", hours=7.0)})
    assert not any(f["type"] == "global" for f in out)


def test_llm_rejected_when_it_invents_a_number(monkeypatch):
    counts = {"live": 1, "silent": 8, "never": 0}

    class Resp:
        def __init__(self, text):
            self.text = text

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            import json
            return json.dumps({"response": self.text}).encode()

    monkeypatch.setattr(d.urllib.request, "urlopen", lambda *a, **k: Resp("1 live, 8 inactive, 99 alerts"))
    assert d.llm_digest([], counts, "2026-10-06") is None
    monkeypatch.setattr(d.urllib.request, "urlopen", lambda *a, **k: Resp("1 live and 8 inactive, no changes."))
    assert d.llm_digest([], counts, "2026-10-06") is not None


def test_llm_unreachable_returns_none(monkeypatch):
    def boom(*a, **k):
        raise d.urllib.error.URLError("down")
    monkeypatch.setattr(d.urllib.request, "urlopen", boom)
    assert d.llm_digest([], {"live": 0, "silent": 0, "never": 0}, "2026-10-06") is None
