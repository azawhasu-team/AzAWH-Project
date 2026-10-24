"""Daily data-quality score for a station — pure functions, no I/O.

Answers "can I trust this station's data on day X?" from the hourly rows the
/hourly endpoint already builds. The sensor rules are the production version
of the Phase 2 / station_health_digest checks:

* frozen  - a sensor reports the exact same value for a whole day (stuck)
* dead    - a sensor that works on other days reports nothing today
* range   - physically impossible values (e.g. humidity above 100 %)

A sensor that never reports anywhere in the window is treated as "not
installed" (stations have different hardware), not as dead.

Score (0-100) = coverage percentage, minus 20 per frozen/dead sensor, minus up
to 20 for out-of-range hours. Labels: good >= 85, fair >= 60, poor below.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional

# Arizona does not observe DST, so a fixed offset is exact.
STATION_TZ = timezone(timedelta(hours=-7))

# (field prefix in the hourly rows, human label, plausible [lo, hi])
SENSORS = (
    ("temperature", "intake temperature", (-30.0, 70.0)),
    ("humidity", "intake humidity", (0.0, 100.5)),
    ("outtake_temperature", "outtake temperature", (-30.0, 90.0)),
    ("outtake_humidity", "outtake humidity", (0.0, 100.5)),
)

MIN_HOURS_FOR_FROZEN = 6
FROZEN_EPSILON = 1e-6
ISSUE_PENALTY = 20
MAX_RANGE_PENALTY = 20
GOOD_AT = 85
FAIR_AT = 60


def label_for(score: float) -> str:
    return "good" if score >= GOOD_AT else "fair" if score >= FAIR_AT else "poor"


def _parse_hour(hour: str) -> datetime:
    return datetime.fromisoformat(hour.replace("Z", "+00:00")).astimezone(timezone.utc)


def _isnum(v) -> bool:
    return isinstance(v, (int, float)) and v == v  # excludes None and NaN


def _day_issues(day_rows: list[dict], sensors_present: set[str]) -> tuple[list[dict], int, int]:
    """Returns (issues, out_of_range_hours, hours_checked)."""
    issues: list[dict] = []
    out_of_range_hours = 0
    for prefix, label, (lo, hi) in SENSORS:
        key = f"{prefix}_mean"
        vals = [r[key] for r in day_rows if _isnum(r.get(key))]
        if not vals:
            if prefix in sensors_present:
                issues.append({"sensor": label, "kind": "dead", "detail": "no readings today but it works on other days"})
            continue
        if len(vals) >= MIN_HOURS_FOR_FROZEN and max(vals) - min(vals) < FROZEN_EPSILON:
            issues.append({"sensor": label, "kind": "frozen", "detail": f"constant {vals[0]:g} for {len(vals)} hours"})
        bad = sum(1 for v in vals if v < lo or v > hi)
        out_of_range_hours += bad
        if bad:
            issues.append({"sensor": label, "kind": "range", "detail": f"{bad} hour(s) outside {lo:g}..{hi:g}"})
    return issues, out_of_range_hours, len(day_rows)


def daily_quality(hourly_rows: Iterable[dict], now: Optional[datetime] = None) -> list[dict]:
    """One entry per local (Phoenix) day that has any data, oldest first.

    `now` bounds today's expected hours, so a morning snapshot is not marked
    down for the afternoon that has not happened yet.
    """
    now = now or datetime.now(timezone.utc)
    rows = [r for r in hourly_rows if r.get("hour")]
    if not rows:
        return []

    sensors_present = {
        prefix for prefix, _, _ in SENSORS if any(_isnum(r.get(f"{prefix}_mean")) for r in rows)
    }

    by_day: dict[str, list[dict]] = {}
    for r in rows:
        local = _parse_hour(r["hour"]).astimezone(STATION_TZ)
        by_day.setdefault(local.date().isoformat(), []).append(r)

    now_local = now.astimezone(STATION_TZ)
    out = []
    for day in sorted(by_day):
        day_rows = by_day[day]
        expected_hours = 24
        if day == now_local.date().isoformat():
            expected_hours = max(1, now_local.hour + 1)
        hours_with_data = len({r["hour"] for r in day_rows})
        coverage = min(100.0, 100.0 * hours_with_data / expected_hours)

        issues, bad_hours, checked = _day_issues(day_rows, sensors_present)
        sensor_issues = [i for i in issues if i["kind"] in ("frozen", "dead")]
        range_penalty = min(MAX_RANGE_PENALTY, 100.0 * bad_hours / max(1, checked * len(SENSORS)) * 4)
        score = max(0.0, min(100.0, coverage - ISSUE_PENALTY * len(sensor_issues) - range_penalty))
        out.append(
            {
                "date": day,
                "score": round(score),
                "label": label_for(score),
                "coverage_pct": round(coverage),
                "hours_with_data": hours_with_data,
                "expected_hours": expected_hours,
                "issues": issues,
            }
        )
    return out
