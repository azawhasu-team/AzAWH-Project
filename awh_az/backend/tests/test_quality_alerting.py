"""Data-quality scoring, calibration validation, and the alert state machine."""
from datetime import datetime, timedelta, timezone

import pytest

import alerting
import calibrations
import quality

NOW = datetime(2026, 10, 22, 20, 0, tzinfo=timezone.utc)  # 13:00 in Phoenix


def hour_rows(day_utc, hours, **fields):
    base = datetime.fromisoformat(day_utc).replace(tzinfo=timezone.utc)
    return [
        {"hour": (base + timedelta(hours=h)).strftime("%Y-%m-%dT%H:00:00Z"),
         "temperature_mean": 25 + h * 0.1, "humidity_mean": 40 + h * 0.2,
         "outtake_temperature_mean": 20 + h * 0.1, "outtake_humidity_mean": 60 + h * 0.2, **fields}
        for h in hours
    ]


class TestQuality:
    def test_full_clean_day_scores_100(self):
        # Phoenix day 2026-10-20 = 07:00 UTC on the 20th .. 06:00 UTC on the 21st
        rows = hour_rows("2026-10-20", range(7, 24)) + hour_rows("2026-10-21", range(0, 7))
        day = quality.daily_quality(rows, NOW)
        d = [x for x in day if x["date"] == "2026-10-20"][0]
        assert d["score"] == 100 and d["label"] == "good" and d["issues"] == []

    def test_coverage_drives_score(self):
        rows = hour_rows("2026-10-20", range(7, 19))  # 12 of 24 hours
        d = quality.daily_quality(rows, NOW)[0]
        assert d["coverage_pct"] == 50 and d["label"] == "poor"

    def test_today_is_judged_against_hours_elapsed(self):
        rows = hour_rows("2026-10-22", range(7, 21))  # 07:00-20:00 UTC = hours 0..13 Phoenix
        d = quality.daily_quality(rows, NOW)[0]
        assert d["expected_hours"] == 14 and d["coverage_pct"] == 100

    def test_frozen_sensor_is_penalised(self):
        rows = hour_rows("2026-10-20", range(7, 24), temperature_mean=24.0)
        rows += hour_rows("2026-10-21", range(0, 7), temperature_mean=24.0)
        d = quality.daily_quality(rows, NOW)[0]
        assert any(i["kind"] == "frozen" and i["sensor"] == "intake temperature" for i in d["issues"])
        assert d["score"] == 80

    def test_dead_only_if_it_works_on_other_days(self):
        good = hour_rows("2026-10-19", range(7, 24))
        dead = hour_rows("2026-10-20", range(7, 24), humidity_mean=None)
        d = {x["date"]: x for x in quality.daily_quality(good + dead, NOW)}
        assert any(i["kind"] == "dead" for i in d["2026-10-20"]["issues"])
        # never-installed sensor across the whole window is NOT dead
        only = quality.daily_quality(hour_rows("2026-10-20", range(7, 24), humidity_mean=None), NOW)[0]
        assert not any(i["kind"] == "dead" for i in only["issues"])

    def test_impossible_values_are_flagged(self):
        rows = hour_rows("2026-10-20", range(7, 24))
        rows[3]["humidity_mean"] = 130
        d = quality.daily_quality(rows, NOW)[0]
        assert any(i["kind"] == "range" for i in d["issues"])

    def test_no_rows(self):
        assert quality.daily_quality([], NOW) == []


class TestCalibrations:
    def test_valid(self):
        e = calibrations.validate_event({"date": "2026-10-01", "sensor": "Balance", "note": " zeroed "}, today=NOW.date())
        assert e == {"date": "2026-10-01", "sensor": "balance", "note": "zeroed"}

    @pytest.mark.parametrize("payload", [
        {"date": "10/01/2026", "sensor": "balance"},
        {"date": "2026-12-01", "sensor": "balance"},
        {"date": "2026-10-01", "sensor": "toaster"},
        {"date": "2026-10-01", "sensor": "balance", "note": "x" * 501},
    ])
    def test_invalid(self, payload):
        with pytest.raises(calibrations.CalibrationError):
            calibrations.validate_event(payload, today=NOW.date())

    def test_last_date(self):
        assert calibrations.last_calibration_date([{"date": "2026-01-01"}, {"date": "2026-09-01"}]) == "2026-09-01"
        assert calibrations.last_calibration_date([]) is None


def station(name, minutes_ago, display=None):
    return {"station_name": name, "display_name": display,
            "metadata": {"last_reading": (NOW - timedelta(minutes=minutes_ago)).isoformat()}}


class TestEvaluate:
    def test_stale_live_station_alerts_but_retired_does_not(self):
        stations = [station("live", 300), station("retired", 60 * 24 * 90), station("fine", 5)]
        alerts = alerting.evaluate(stations, {}, NOW, stale_minutes=120)
        assert [a.id for a in alerts] == ["live|stale"]
        assert alerts[0].severity == "warning"

    def test_long_silence_is_critical(self):
        a = alerting.evaluate([station("s", 60 * 10)], {}, NOW, stale_minutes=120)[0]
        assert a.severity == "critical"

    def test_explicit_override_covers_old_station(self):
        a = alerting.evaluate([station("old", 60 * 24 * 90)], {}, NOW, explicit={"old": 30})
        assert a and a[0].rule == "stale"

    def test_low_quality_alert(self):
        q = {"s": {"date": "2026-10-21", "score": 40, "coverage_pct": 55, "issues": [{"sensor": "intake humidity", "kind": "frozen"}]}}
        alerts = alerting.evaluate([station("s", 5)], q, NOW)
        assert alerts[0].rule == "low_quality" and "intake humidity" in alerts[0].detail


def alert(sev="warning", aid="s|stale"):
    return alerting.Alert(aid, "s", "S", "stale", sev, "S: not sending data", "detail")


class TestPlan:
    def test_new_then_quiet_then_reminder(self):
        notes, st = alerting.plan([alert()], {}, NOW)
        assert [k for k, _ in notes] == ["new"]
        notes, st = alerting.plan([alert()], st, NOW + timedelta(hours=1))
        assert notes == []
        notes, st = alerting.plan([alert()], st, NOW + timedelta(hours=13))
        assert [k for k, _ in notes] == ["reminder"]

    def test_ack_silences_until_resolved_then_resolution_is_announced(self):
        _, st = alerting.plan([alert()], {}, NOW)
        st["s|stale"] = alerting.apply_action(st["s|stale"], "ack", NOW)
        notes, st = alerting.plan([alert()], st, NOW + timedelta(hours=48))
        assert notes == []
        notes, st = alerting.plan([], st, NOW + timedelta(hours=49))
        assert [k for k, _ in notes] == ["resolved"]
        notes, st = alerting.plan([], st, NOW + timedelta(hours=50))
        assert notes == []
        notes, _ = alerting.plan([alert()], st, NOW + timedelta(hours=60))
        assert [k for k, _ in notes] == ["new"]  # it came back

    def test_snooze_defers_reminder_but_expires(self):
        _, st = alerting.plan([alert()], {}, NOW)
        st["s|stale"] = alerting.apply_action(st["s|stale"], "snooze", NOW, 24)
        assert alerting.plan([alert()], st, NOW + timedelta(hours=13))[0] == []
        notes, _ = alerting.plan([alert()], st, NOW + timedelta(hours=25))
        assert [k for k, _ in notes] == ["reminder"]

    def test_escalation_breaks_through_an_ack_but_not_a_snooze(self):
        _, st = alerting.plan([alert("warning")], {}, NOW)
        st["s|stale"] = alerting.apply_action(st["s|stale"], "ack", NOW)
        notes, _ = alerting.plan([alert("critical")], st, NOW + timedelta(hours=1))
        assert [k for k, _ in notes] == ["escalated"]
        _, st2 = alerting.plan([alert("warning")], {}, NOW)
        st2["s|stale"] = alerting.apply_action(st2["s|stale"], "snooze", NOW, 4)
        assert alerting.plan([alert("critical")], st2, NOW + timedelta(hours=1))[0] == []

    def test_bad_actions_rejected(self):
        with pytest.raises(ValueError):
            alerting.apply_action({}, "snooze", NOW, 5)
        with pytest.raises(ValueError):
            alerting.apply_action({}, "delete", NOW)


class TestTokens:
    def test_roundtrip_expiry_and_tamper(self):
        t = alerting.make_token("k", "s|stale", "snooze", 4, NOW)
        assert alerting.verify_token("k", t, NOW)["a"] == "s|stale"
        assert alerting.verify_token("other", t, NOW) is None
        assert alerting.verify_token("k", t, NOW + timedelta(hours=alerting.LINK_TTL_HOURS + 1)) is None
        body, sig = t.split(".")
        assert alerting.verify_token("k", body[:-2] + "AA." + sig, NOW) is None
        assert alerting.verify_token("", t, NOW) is None
        assert alerting.verify_token("k", "garbage", NOW) is None

    def test_message_links_only_when_configured(self):
        _, plain, slack = alerting.build_message("new", alert().__dict__, "https://api.example", "k", NOW)
        assert "/admin/alerts-action?token=" in plain and "Acknowledge" in slack
        _, plain, _ = alerting.build_message("new", alert().__dict__, "", "k", NOW)
        assert "token=" not in plain
        _, plain, _ = alerting.build_message("resolved", alert().__dict__, "https://api.example", "k", NOW)
        assert "token=" not in plain and plain.startswith("RESOLVED")


# ---------------------------------------------------------------------------
# power_missing
# ---------------------------------------------------------------------------
def _hrs(*powers):
    return [{"power_mean": p, "reading_count": 60} for p in powers]


def test_power_status_counts_trailing_missing_hours():
    a = alerting.power_status(_hrs(1100, 1200, None, None, None))
    assert (a["reports_power"], a["missing_hours"]) == (True, 3)
    b = alerting.power_status(_hrs(None, 1100))
    assert (b["reports_power"], b["missing_hours"]) == (True, 0)


def test_energy_only_meter_is_never_a_power_fault():
    # DEM730P: power is always null by design
    st = alerting.power_status(_hrs(None, None, None, None))
    assert (st["reports_power"], st["missing_hours"]) == (False, 4)
    now = datetime(2026, 10, 31, 12, tzinfo=timezone.utc)
    stations = [{"station_name": "a", "metadata": {"last_reading": now.isoformat()}}]
    assert alerting.evaluate(stations, {}, now, power={"a": st}) == []


def test_power_missing_alert_fires_after_threshold_for_meters_that_report_power():
    now = datetime(2026, 10, 31, 12, tzinfo=timezone.utc)
    stations = [{"station_name": "a", "metadata": {"last_reading": now.isoformat()}}]
    one = alerting.evaluate(stations, {}, now, power={"a": {"reports_power": True, "missing_hours": 1}})
    assert one == []
    out = alerting.evaluate(stations, {}, now, power={"a": {"reports_power": True, "missing_hours": 3}})
    assert [a.rule for a in out] == ["power_missing"] and out[0].severity == "warning"
    out = alerting.evaluate(stations, {}, now, power={"a": {"reports_power": True, "missing_hours": 8}})
    assert out[0].severity == "critical"


# ---------------------------------------------------------------------------
# station_off
# ---------------------------------------------------------------------------
def _en(*kwh):
    return [{"energy_consumed_kWh": v, "power_mean": None, "reading_count": 60} for v in kwh]


def test_station_off_when_no_energy_used_for_two_hours():
    now = datetime(2026, 10, 31, 12, tzinfo=timezone.utc)
    stations = [{"station_name": "a", "metadata": {"last_reading": now.isoformat()}}]
    st = alerting.power_status(_en(1.2, 1.1, None, None))
    assert st["off_hours"] == 2 and st["reports_energy"]
    out = alerting.evaluate(stations, {}, now, power={"a": st})
    assert [a.rule for a in out] == ["station_off"] and "turned off" in out[0].title
    # running again -> alert clears (plan() then sends the RESOLVED email)
    on = alerting.power_status(_en(1.2, None, None, 1.0))
    assert alerting.evaluate(stations, {}, now, power={"a": on}) == []


def test_one_quiet_bucket_is_not_off_and_a_station_with_no_energy_history_never_is():
    now = datetime(2026, 10, 31, 12, tzinfo=timezone.utc)
    stations = [{"station_name": "a", "metadata": {"last_reading": now.isoformat()}}]
    assert alerting.evaluate(stations, {}, now, power={"a": alerting.power_status(_en(1.2, 1.1, None))}) == []
    never = alerting.power_status(_en(None, None, None))
    assert never["reports_energy"] is False
    assert alerting.evaluate(stations, {}, now, power={"a": never}) == []


def test_power_meter_fault_is_not_also_reported_as_station_off():
    now = datetime(2026, 10, 31, 12, tzinfo=timezone.utc)
    stations = [{"station_name": "a", "metadata": {"last_reading": now.isoformat()}}]
    rows = [{"energy_consumed_kWh": 1.0, "power_mean": 1100, "reading_count": 60}] * 2 + \
           [{"energy_consumed_kWh": None, "power_mean": None, "reading_count": 60}] * 3
    out = alerting.evaluate(stations, {}, now, power={"a": alerting.power_status(rows)})
    assert [a.rule for a in out] == ["power_missing"]


# ---------------------------------------------------------------------------
# energy_stuck: no energy counted while the fans are running (frozen DEM730P)
# ---------------------------------------------------------------------------
def _en_v(*pairs):
    return [{"energy_consumed_kWh": e, "velocity_mean": v, "power_mean": None, "reading_count": 60} for e, v in pairs]


def test_no_energy_while_fans_run_is_energy_stuck_not_station_off():
    now = datetime(2026, 10, 31, 12, tzinfo=timezone.utc)
    stations = [{"station_name": "a", "metadata": {"last_reading": now.isoformat()}}]
    st = alerting.power_status(_en_v((0.8, 1.9), (0.8, 1.9), (None, 1.9), (None, 1.9)))
    assert st["stuck_hours"] == 2 and st["off_hours"] == 2
    out = alerting.evaluate(stations, {}, now, power={"a": st})
    assert [a.rule for a in out] == ["energy_stuck"] and "not updating" in out[0].title
    assert out[0].severity == "warning"
    long = alerting.power_status(_en_v((0.8, 1.9), *[(None, 1.9)] * 6))
    assert alerting.evaluate(stations, {}, now, power={"a": long})[0].severity == "critical"


def test_no_energy_with_fans_off_is_still_station_off():
    now = datetime(2026, 10, 31, 12, tzinfo=timezone.utc)
    stations = [{"station_name": "a", "metadata": {"last_reading": now.isoformat()}}]
    st = alerting.power_status(_en_v((0.8, 1.9), (0.8, 1.9), (None, 0.0), (None, 0.0)))
    assert st["stuck_hours"] == 0
    out = alerting.evaluate(stations, {}, now, power={"a": st})
    assert [a.rule for a in out] == ["station_off"]


def test_energy_stuck_clears_when_energy_counts_again():
    now = datetime(2026, 10, 31, 12, tzinfo=timezone.utc)
    stations = [{"station_name": "a", "metadata": {"last_reading": now.isoformat()}}]
    ok = alerting.power_status(_en_v((0.8, 1.9), (None, 1.9), (None, 1.9), (0.8, 1.9)))
    assert ok["stuck_hours"] == 0
    assert alerting.evaluate(stations, {}, now, power={"a": ok}) == []


# ---------------------------------------------------------------------------
# delivery failures must be retried, and the HTTPS (Brevo API) sender
# ---------------------------------------------------------------------------
def test_failed_notification_is_not_recorded_as_announced():
    now = datetime(2026, 10, 31, 12, tzinfo=timezone.utc)
    a = alerting.Alert("s|stale", "s", "S", "stale", "warning", "S: not sending", "x")
    notes, new_state = alerting.plan([a], {}, now)
    assert [k for k, _ in notes] == ["new"] and "s|stale" in new_state
    restored = alerting.undo_failed(new_state, {}, notes)
    assert "s|stale" not in restored          # next run sees it as new again and retries
    # a reminder that failed keeps the OLD last_notified, so it is retried too
    later = now + timedelta(hours=13)
    notes2, st2 = alerting.plan([a], new_state, later)
    assert [k for k, _ in notes2] == ["reminder"]
    back = alerting.undo_failed(st2, new_state, notes2)
    assert back["s|stale"]["last_notified"] == new_state["s|stale"]["last_notified"]


def test_brevo_api_sender_posts_json_over_https(monkeypatch):
    seen = {}

    class Resp:
        status = 201
        def __enter__(self): return self
        def __exit__(self, *a): return False

    def fake_urlopen(req, timeout=None):
        seen["url"], seen["headers"], seen["body"] = req.full_url, dict(req.header_items()), req.data
        return Resp()

    monkeypatch.setattr(alerting.urllib.request, "urlopen", fake_urlopen)
    alerting.send_email_brevo_api("KEY", "from@x.org", ["a@x.edu", "b@x.edu"], "Subj", "Body")
    assert seen["url"] == "https://api.brevo.com/v3/smtp/email"
    assert seen["headers"]["Api-key"] == "KEY"
    import json as _json
    body = _json.loads(seen["body"])
    assert [t["email"] for t in body["to"]] == ["a@x.edu", "b@x.edu"] and body["subject"] == "Subj"
