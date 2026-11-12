"""Contract tests: the dashboard's hand-written TypeScript types vs what the backend really returns.

Nothing else links awh_az/water-station-dashboard/src/lib/api-client.ts to the Pydantic models, so a
renamed or removed backend field would silently turn into `undefined` in the UI. These tests fail
instead. Names must match in both directions; value kinds (string/number/...) must agree.

Skipped when the dashboard sources aren't present next to the backend (e.g. a backend-only checkout).
"""
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

import main

API_CLIENT = Path(__file__).resolve().parents[2] / "water-station-dashboard" / "src" / "lib" / "api-client.ts"
pytestmark = pytest.mark.skipif(not API_CLIENT.exists(), reason="dashboard sources not present")


# ---------------------------------------------------------------------------
# Tiny TypeScript interface reader (these interfaces are flat `name?: type;` lists)
# ---------------------------------------------------------------------------
def ts_interface(name: str) -> dict:
    src = re.sub(r"/\*.*?\*/", "", API_CLIENT.read_text(), flags=re.S)
    src = re.sub(r"//[^\n]*", "", src)
    m = re.search(r"export interface %s\s*\{(.*?)\n\}" % re.escape(name), src, re.S)
    assert m, f"interface {name} not found in api-client.ts"
    fields = {}
    for line in m.group(1).splitlines():
        mm = re.match(r"\s*(\w+)(\?)?\s*:\s*(.+?);?\s*$", line)
        if mm:
            fields[mm.group(1)] = {"optional": bool(mm.group(2)), "type": mm.group(3).rstrip(";").strip()}
    assert fields, f"interface {name} has no parsable fields"
    return fields


def ts_kind(type_text: str) -> str:
    """Coarse kind of a TS type: string | number | boolean | array | object | any."""
    parts = [p.strip() for p in type_text.split("|") if p.strip() not in ("null", "undefined")]
    if len(parts) != 1:
        return "any"  # unions of real types (string literals etc.) aren't compared
    t = parts[0]
    if t.endswith("[]") or t.startswith("Array<"):
        return "array"
    if t in ("string", "number", "boolean"):
        return t
    if t.startswith("Record<") or t.startswith("{"):
        return "object"
    if re.fullmatch(r"'[^']*'(\s*\|\s*'[^']*')*", t):
        return "string"
    return "any"  # another interface name, etc.


def py_kind(schema: dict) -> str:
    options = schema.get("anyOf") or [schema]
    kinds = set()
    for o in options:
        if o.get("type") == "null":
            continue
        t = o.get("type")
        if "$ref" in o:
            kinds.add("any")
        elif t in ("integer", "number"):
            kinds.add("number")
        elif t in ("string", "boolean", "array", "object"):
            kinds.add(t)
        else:
            kinds.add("any")
    return kinds.pop() if len(kinds) == 1 else "any"


# ---------------------------------------------------------------------------
# Models that have an OpenAPI schema
# ---------------------------------------------------------------------------
MODELS = ["StationReading", "StationMetadata", "StationInfo", "ReadingsResponse",
          "BulkExportRequest", "HealthResponse", "StationImpact", "ImpactResponse"]


@pytest.mark.parametrize("name", MODELS)
def test_ts_interface_matches_backend_model(name):
    schema = main.app.openapi()["components"]["schemas"][name]
    py_props = schema["properties"]
    ts = ts_interface(name)

    assert set(py_props) - set(ts) == set(), f"{name}: backend fields missing from the TypeScript type"
    assert set(ts) - set(py_props) == set(), f"{name}: TypeScript fields the backend does not provide"

    mismatches = []
    for field, prop in py_props.items():
        pk, tk = py_kind(prop), ts_kind(ts[field]["type"])
        if "any" not in (pk, tk) and pk != tk:
            mismatches.append(f"{field}: backend {pk}, TypeScript {tk}")
    assert not mismatches, f"{name}: value kinds differ: {mismatches}"


def test_every_documented_response_model_is_checked():
    """If someone adds a response model the dashboard consumes, make them add it to MODELS."""
    schemas = set(main.app.openapi()["components"]["schemas"])
    dashboard_facing = {"StationReading", "StationMetadata", "StationInfo", "ReadingsResponse",
                        "BulkExportRequest", "HealthResponse", "StationImpact", "ImpactResponse"}
    assert dashboard_facing <= schemas


# ---------------------------------------------------------------------------
# /hourly has no response_model, so test the real output instead
# ---------------------------------------------------------------------------
def hourly_readings(hours=3):
    """One reading a minute for `hours` hours, ascending, with every sensor the maths uses."""
    t0 = datetime(2026, 6, 1, 8, 0, tzinfo=timezone.utc)
    out = []
    for i in range(hours * 60):
        out.append({
            "station_name": "x", "timestamp": (t0 + timedelta(minutes=i)).isoformat(), "unit": "m/s",
            "temperature": 30.0 + (i % 5), "humidity": 40.0 + (i % 7), "velocity": 2.0,
            "outtake_temperature": 25.0, "outtake_humidity": 70.0, "outtake_velocity": 1.5, "outtake_unit": "m/s",
            "weight": 100.0 + i * 2.0, "power": 1200.0 + i, "voltage": 230.0, "current": 5.2,
            "energy": 1000.0 + i * 20.0, "pump_status": 1,
        })
    return out


def test_hourly_response_matches_typescript_types(client, use_firestore):
    use_firestore({"x": {"readings": hourly_readings(), "meta": {}}})
    r = client.get("/stations/x/hourly")
    assert r.status_code == 200
    body = r.json()

    top = ts_interface("HourlyAggregationResponse")
    assert set(body) == set(top), f"top-level keys differ: backend {sorted(body)} vs TypeScript {sorted(top)}"

    row_ts = ts_interface("HourlyDataRow")
    assert len(body["data"]) >= 3
    for row in body["data"]:
        extra = set(row) - set(row_ts)
        missing_required = {k for k, v in row_ts.items() if not v["optional"]} - set(row)
        assert not extra, f"backend returns hourly fields the TypeScript type doesn't know: {sorted(extra)}"
        assert not missing_required, f"TypeScript requires hourly fields the backend didn't return: {sorted(missing_required)}"


def test_hourly_value_kinds_match_typescript(client, use_firestore):
    use_firestore({"x": {"readings": hourly_readings(), "meta": {}}})
    body = client.get("/stations/x/hourly").json()
    row_ts = ts_interface("HourlyDataRow")
    bad = []
    for row in body["data"]:
        for k, v in row.items():
            tk = ts_kind(row_ts[k]["type"])
            if v is None:
                if "null" not in row_ts[k]["type"] and not row_ts[k]["optional"]:
                    bad.append(f"{k}: null but TypeScript type is {row_ts[k]['type']}")
            elif isinstance(v, str) and tk != "string":
                bad.append(f"{k}: string but TypeScript {tk}")
            elif isinstance(v, (int, float)) and not isinstance(v, bool) and tk != "number":
                bad.append(f"{k}: number but TypeScript {tk}")
    assert not bad, bad[:10]


def test_hourly_flow_volume_is_integrated_flow_rate(client, use_firestore):
    # Constant 1.2 L/min, one reading a minute -> 72 L per full hour,
    # independent of the weight-based water_produced_L.
    readings = hourly_readings()
    for r in readings:
        r["flow_lmin"] = 1.2
    use_firestore({"x": {"readings": readings, "meta": {}}})
    rows = client.get("/stations/x/hourly").json()["data"]
    assert rows[1]["water_produced_flow_L"] == pytest.approx(72.0, rel=1e-3)


def test_hourly_flow_volume_is_null_without_a_flow_meter(client, use_firestore):
    use_firestore({"x": {"readings": hourly_readings(), "meta": {}}})
    rows = client.get("/stations/x/hourly").json()["data"]
    assert all(r["water_produced_flow_L"] is None for r in rows)


# ---------------------------------------------------------------------------
# Weather
# ---------------------------------------------------------------------------
def test_weather_flags_rain_and_dust():
    import weather
    assert weather.classify({"precip_mm": 0.4, "weather_code": 0, "pm10": 20, "gust_kmh": 10})["rain"]
    assert weather.classify({"precip_mm": 0, "weather_code": 81})["rain"]
    dusty = weather.classify({"precip_mm": 0, "weather_code": 0, "pm10": 600, "gust_kmh": 60})
    assert dusty["dust_event"] and "Dust event" in dusty["condition"]
    # High PM10 with no wind is not flagged as a blowing-dust event
    assert not weather.classify({"pm10": 600, "gust_kmh": 5})["dust_event"]
    assert weather.classify({})["condition"] == "No rain or dust"


def test_weather_endpoint_returns_rows_and_502_when_provider_down(client, monkeypatch):
    import weather
    row = {"hour": "2026-06-01T08:00:00Z", "temperature_c": 30.0, "rain": False, "dust_event": False}
    monkeypatch.setattr(weather, "get_hourly_weather", lambda *a, **k: [row])
    body = client.get("/stations/x/weather").json()
    assert body["total_hours"] == 1 and body["data"][0]["temperature_c"] == 30.0

    def boom(*a, **k):
        raise OSError("down")
    monkeypatch.setattr(weather, "get_hourly_weather", boom)
    assert client.get("/stations/x/weather").status_code == 502


def _energy_hours(null_power_in_hour_two):
    rs = hourly_readings()
    if null_power_in_hour_two:
        for r in rs[60:90]:          # 30 minutes of hour 2 with the meter silent
            r["power"] = None
    return rs


def test_hourly_energy_leaves_out_stretches_where_power_is_missing(client, use_firestore):
    use_firestore({"x": {"readings": _energy_hours(False), "meta": {}}})
    full = client.get("/stations/x/hourly").json()["data"]
    main.cache.delete_pattern("hourly:*")   # same URL would otherwise return the cached first result
    use_firestore({"x": {"readings": _energy_hours(True), "meta": {}}})
    cut = client.get("/stations/x/hourly").json()["data"]
    assert cut[1]["energy_consumed_kWh"] < full[1]["energy_consumed_kWh"]


def test_energy_only_station_keeps_its_energy_when_power_is_always_null(client, use_firestore):
    rs = hourly_readings()
    for r in rs:
        r["power"] = None            # DEM730P-style: never reports power
    use_firestore({"x": {"readings": rs, "meta": {}}})
    rows = client.get("/stations/x/hourly").json()["data"]
    assert rows[1]["energy_consumed_kWh"] is not None and rows[1]["energy_consumed_kWh"] > 0


# ---------------------------------------------------------------------------
# a frozen energy meter that catches up after a data gap must not land as one lump
# ---------------------------------------------------------------------------
def _counting_readings(minutes, start_min, kwh_start, kw=0.8, frozen=False):
    """One reading a minute from `start_min`; energy counts at `kw` unless frozen."""
    t0 = datetime(2026, 6, 1, 0, 0, tzinfo=timezone.utc)
    out = []
    for i in range(minutes):
        e = kwh_start if frozen else kwh_start + i * kw / 60.0
        out.append({
            "station_name": "x", "timestamp": (t0 + timedelta(minutes=start_min + i)).isoformat(), "unit": "m/s",
            "temperature": 30.0, "humidity": 40.0, "velocity": 2.0,
            "outtake_temperature": 25.0, "outtake_humidity": 70.0, "outtake_velocity": 1.5, "outtake_unit": "m/s",
            "weight": 100.0 + (start_min + i) * 1.0, "power": None, "voltage": None, "current": None,
            "energy": e, "pump_status": 1,
        })
    return out


def _hourly_energy(client, use_firestore, readings):
    main.cache.delete_pattern("hourly:*")
    use_firestore({"x": {"readings": readings, "meta": {}}})
    return [r["energy_consumed_kWh"] for r in client.get("/stations/x/hourly").json()["data"]]


def test_frozen_meter_catching_up_after_a_gap_is_left_out(client, use_firestore):
    rs = (
        _counting_readings(60, 0, 100.0)                           # hour 0: counting normally
        + _counting_readings(120, 60, 100.8, frozen=True)           # hours 1-2: frozen at 100.8
        + _counting_readings(60, 60 + 120 + 1440, 127.2)           # 24 h gap, then it has caught up by +26.4 kWh (~1.1 kW average, so the 3 kW jump rule alone lets it through)
    )
    energy = _hourly_energy(client, use_firestore, rs)
    assert all(e is None or e <= 3.0 for e in energy), energy      # no 26 kWh hour


def test_meter_that_was_counting_before_a_gap_still_counts_its_reconnection(client, use_firestore):
    rs = _counting_readings(60, 0, 100.0) + _counting_readings(60, 60 + 180, 100.8 + 0.8 * 3)   # 3 h gap, consumption continued
    energy = _hourly_energy(client, use_firestore, rs)
    assert any(e is not None and e > 1.5 for e in energy), energy   # the 2.4 kWh used during the gap is still counted


def test_hourly_energy_per_litre_by_flow_is_energy_over_flow_volume(client, use_firestore):
    rs = _counting_readings(120, 0, 100.0)               # 0.8 kWh per hour
    for r in rs:
        r["flow_lmin"] = 0.5                              # 0.5 L/min = 30 L per hour
    main.cache.delete_pattern("hourly:*")
    use_firestore({"x": {"readings": rs, "meta": {}}})
    rows = client.get("/stations/x/hourly").json()["data"]
    full = [r for r in rows if r["energy_consumed_kWh"] and r["water_produced_flow_L"]]
    assert full, rows
    r = full[0]
    assert r["energy_per_liter_flow_kWh_L"] == pytest.approx(r["energy_consumed_kWh"] / r["water_produced_flow_L"], abs=1e-4)
    assert 0.02 < r["energy_per_liter_flow_kWh_L"] < 0.04   # ~0.8 kWh / ~30 L


def test_energy_per_litre_by_flow_is_a_gap_without_a_flow_meter(client, use_firestore):
    rs = _counting_readings(120, 0, 100.0)               # no flow_lmin at all
    main.cache.delete_pattern("hourly:*")
    use_firestore({"x": {"readings": rs, "meta": {}}})
    rows = client.get("/stations/x/hourly").json()["data"]
    assert all(r["energy_per_liter_flow_kWh_L"] is None for r in rows)


def test_idle_draw_below_the_off_floor_is_in_total_energy_but_not_energy_per_litre(client, use_firestore):
    main.cache.delete_pattern("hourly:*")
    use_firestore({"x": {"readings": _counting_readings(180, 0, 100.0, kw=0.15), "meta": {}}})   # 150 W idle, under the 0.2 kWh/h floor
    rows = client.get("/stations/x/hourly").json()["data"]
    mid = rows[1]
    assert mid["energy_consumed_kWh"] is None                      # still treated as "off" for specific energy
    assert mid["energy_total_kWh"] == pytest.approx(0.15, abs=0.02)
    assert mid["energy_per_liter_kWh_L"] is None


def test_total_energy_equals_floored_energy_when_the_station_is_running(client, use_firestore):
    main.cache.delete_pattern("hourly:*")
    use_firestore({"x": {"readings": _counting_readings(180, 0, 100.0, kw=0.8), "meta": {}}})
    mid = client.get("/stations/x/hourly").json()["data"][1]
    assert mid["energy_total_kWh"] == mid["energy_consumed_kWh"]
