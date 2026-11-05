from datetime import datetime, timedelta, timezone

import pytest

import efficiency
import main

NOW = datetime(2026, 11, 5, 20, 0, tzinfo=timezone.utc)  # 13:00 Phoenix, Nov 5


def hr(day, hour_utc, energy, water):
    """An hourly row; hour_utc is the UTC hour of `day` (Phoenix is UTC-7)."""
    return {"hour": f"2026-11-{day:02d}T{hour_utc:02d}:00:00Z", "energy_consumed_kWh": energy, "water_produced_L": water}


def test_day_is_total_energy_over_total_water_not_mean_of_hourly_ratios():
    # hour A: 1 kWh / 0.01 L = 100 kWh/L (noise); hour B: 1 kWh / 1.99 L. Mean of ratios would be ~50.
    rows = [hr(3, 18, 1.0, 0.01), hr(3, 19, 1.0, 1.99)]
    (d,) = efficiency.daily_energy_per_liter(rows, NOW)
    assert d["date"] == "2026-11-03" and d["kwh_per_L"] == 1.0 and d["energy_kWh"] == 2.0 and d["water_L"] == 2.0


def test_hours_with_missing_energy_or_water_are_left_out_of_both_sides():
    rows = [hr(3, 18, 1.0, 2.0), hr(3, 19, None, 5.0), hr(3, 20, 3.0, None)]
    (d,) = efficiency.daily_energy_per_liter(rows, NOW)
    assert d["hours"] == 1 and d["kwh_per_L"] == 0.5     # the stuck-meter hour does not inflate the water


def test_days_follow_phoenix_local_time():
    # 05:00 UTC Nov 4 is 22:00 Phoenix on Nov 3
    rows = [hr(4, 5, 1.0, 2.0), hr(4, 8, 1.0, 2.0)]
    days = efficiency.daily_energy_per_liter(rows, NOW)
    assert [(d["date"], d["hours"]) for d in days] == [("2026-11-03", 1), ("2026-11-04", 1)]


def test_too_little_water_gives_no_ratio_and_today_is_marked_incomplete():
    rows = [hr(3, 18, 2.0, 0.1), hr(5, 18, 1.0, 2.0)]
    d3, d5 = efficiency.daily_energy_per_liter(rows, NOW)
    assert d3["kwh_per_L"] is None and d3["complete"] is True
    assert d5["kwh_per_L"] == 0.5 and d5["complete"] is False


def test_trend_compares_latest_complete_day_with_recent_average():
    rows = []
    for day, ratio in [(1, 1.0), (2, 1.0), (3, 1.0), (4, 0.8)]:      # four complete days, last is better
        rows.append(hr(day, 18, ratio * 2.0, 2.0))
    rows.append(hr(5, 18, 9.0, 1.0))                                  # today, still in progress: ignored
    t = efficiency.trend_summary(efficiency.daily_energy_per_liter(rows, NOW))
    assert t["latest"] == 0.8 and t["latest_date"] == "2026-11-04" and t["baseline"] == 1.0 and t["change_pct"] == -20.0


def test_trend_with_no_valid_days_is_empty():
    assert efficiency.trend_summary([]) == {"latest": None, "latest_date": None, "baseline": None, "change_pct": None}


# ---------------------------------------------------------------------------
# endpoint
# ---------------------------------------------------------------------------
def _stations():
    last = datetime.now(timezone.utc).isoformat()
    return [
        {"station_name": "live", "display_name": "Live Station", "metadata": {"last_reading": last}},
        {"station_name": "old", "display_name": "Retired", "metadata": {"last_reading": "2025-01-01T00:00:00+00:00"}},
    ]


@pytest.fixture
def eff(monkeypatch):
    async def stations():
        return _stations()
    monkeypatch.setattr(main, "get_stations", stations)
    monkeypatch.setattr(main, "db", object())
    main._ALERT_HOURLY_CACHE.clear()
    main._EFFICIENCY_BUSY.clear()
    started = []

    class InlinePool:                       # run the background refresh synchronously and record it
        def submit(self, fn, *a):
            started.append(a)
            fn(*a)
    monkeypatch.setattr(main, "_EFFICIENCY_POOL", InlinePool())
    return started


def test_first_request_reports_warming_then_serves_the_series(client, eff, monkeypatch):
    yday = (datetime.now(timezone.utc) - timedelta(days=2)).replace(minute=0, second=0, microsecond=0)
    row = {"hour": yday.strftime("%Y-%m-%dT%H:00:00Z"), "energy_consumed_kWh": 1.0, "water_produced_L": 4.0}
    monkeypatch.setattr(main, "_compute_hourly_aggregation_sync", lambda n, s, e: {"data": [row]})

    first = client.get("/efficiency/daily?days=14").json()
    assert first["warming"] is True and first["stations"] == []          # cache was cold; read kicked off
    assert eff == [("live", 14)]                                         # only the station that reported recently

    second = client.get("/efficiency/daily?days=14").json()
    assert second["warming"] is False
    (st,) = second["stations"]
    assert st["station_name"] == "live" and st["display_name"] == "Live Station"
    assert st["days"][0]["kwh_per_L"] == 0.25 and st["latest"] == 0.25


def test_station_without_any_valid_day_is_left_out(client, eff, monkeypatch):
    monkeypatch.setattr(main, "_compute_hourly_aggregation_sync", lambda n, s, e: {"data": []})
    client.get("/efficiency/daily")
    r = client.get("/efficiency/daily").json()
    assert r["stations"] == [] and r["warming"] is False


def test_days_parameter_is_bounded(client, eff):
    assert client.get("/efficiency/daily?days=3").status_code == 422
    assert client.get("/efficiency/daily?days=365").status_code == 422


def test_catch_up_lump_after_a_data_gap_is_left_out():
    # first hour back after a day-long gap holds the whole counter delta (26 kWh from 3 readings)
    rows = [hr(3, 18, 26.4, 0.5), hr(3, 19, 0.8, 1.6), hr(3, 20, 0.8, 1.6)]
    (d,) = efficiency.daily_energy_per_liter(rows, NOW)
    assert d["hours"] == 2 and d["energy_kWh"] == 1.6 and d["kwh_per_L"] == 0.5
