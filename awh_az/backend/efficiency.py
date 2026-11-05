"""Daily energy per litre of water (kWh/L) from a station's hourly rows.

Efficiency of a day is total energy divided by total water for that day, never
an average of the hourly ratios: a near-zero-water hour would otherwise dominate
the mean. Only hours where BOTH energy and water are known are counted, so a
stretch with a stuck/missing energy meter (energy left out of consumption) does
not make the day look artificially efficient. Hours with more energy than the
station can draw in an hour (a catch-up lump after a data gap) are left out too.

Days are Phoenix-local, like the data-quality score.
"""
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional

from quality import STATION_TZ

# Below this much water in a day the ratio is noise (one drip over a lot of
# energy), so the day is reported without an efficiency value.
MIN_WATER_L = 0.5

# One hour cannot legitimately hold more energy than the station's maximum draw
# (3 kW, the same limit as ENERGY_JUMP_MAX_KW in main.py). Anything above is a
# catch-up lump: after a long data gap the whole counter delta lands in the first
# hour back (e.g. 26 kWh from 3 readings), which would wreck that day's ratio.
MAX_KWH_PER_HOUR = 3.0


def _num(v) -> Optional[float]:
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _parse_hour(hour: str) -> datetime:
    return datetime.fromisoformat(hour.replace("Z", "+00:00"))


def daily_energy_per_liter(
    hourly_rows: Iterable[dict],
    now: Optional[datetime] = None,
    min_water_l: float = MIN_WATER_L,
) -> list[dict]:
    """One entry per local day that has paired energy+water hours, oldest first:
    {date, energy_kWh, water_L, kwh_per_L (None if too little water), hours, complete}.
    `complete` is False for today, which is still in progress."""
    now = now or datetime.now(timezone.utc)
    today = now.astimezone(STATION_TZ).date().isoformat()
    days: dict[str, dict] = {}
    for r in hourly_rows:
        hour = r.get("hour")
        e, w = _num(r.get("energy_consumed_kWh")), _num(r.get("water_produced_L"))
        if not hour or e is None or w is None or e < 0 or w < 0 or e > MAX_KWH_PER_HOUR:
            continue
        date = _parse_hour(hour).astimezone(STATION_TZ).date().isoformat()
        d = days.setdefault(date, {"date": date, "energy_kWh": 0.0, "water_L": 0.0, "hours": 0})
        d["energy_kWh"] += e
        d["water_L"] += w
        d["hours"] += 1

    out = []
    for date in sorted(days):
        d = days[date]
        ok = d["water_L"] >= min_water_l and d["energy_kWh"] > 0
        out.append(
            {
                "date": date,
                "energy_kWh": round(d["energy_kWh"], 4),
                "water_L": round(d["water_L"], 4),
                "kwh_per_L": round(d["energy_kWh"] / d["water_L"], 4) if ok else None,
                "hours": d["hours"],
                "complete": date < today,
            }
        )
    return out


def trend_summary(days: list[dict], recent: int = 7) -> dict:
    """Latest complete-day value and how it compares with the average of the
    previous `recent` valid days (negative change = more efficient)."""
    valid = [d for d in days if d["complete"] and d["kwh_per_L"] is not None]
    if not valid:
        return {"latest": None, "latest_date": None, "baseline": None, "change_pct": None}
    latest = valid[-1]
    prior = [d["kwh_per_L"] for d in valid[-(recent + 1):-1]]
    baseline = sum(prior) / len(prior) if prior else None
    change = round((latest["kwh_per_L"] - baseline) / baseline * 100, 1) if baseline else None
    return {
        "latest": latest["kwh_per_L"],
        "latest_date": latest["date"],
        "baseline": round(baseline, 4) if baseline is not None else None,
        "change_pct": change,
    }
