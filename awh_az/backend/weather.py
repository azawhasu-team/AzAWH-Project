"""Hourly ambient weather for stations.

Data comes from Open-Meteo (free, no API key): the weather API for temperature,
humidity, wind, precipitation and visibility, and its air-quality API for PM10
and mineral dust, which is what a dust storm shows up as. Hours are returned in
UTC with the same "YYYY-MM-DDTHH:00:00Z" key /hourly uses.

Open-Meteo has no "dust storm" flag. `dust_event` here is derived from PM10 /
dust concentration plus wind (see DUST_* below) and is a "possible dust event"
indicator, not an official NWS declaration.
"""
import json
import logging
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from typing import Any

from cache import cache
from config import settings

logger = logging.getLogger(__name__)

WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
HTTP_TIMEOUT_S = 15
CACHE_TTL_S = 3600
# The forecast endpoint serves roughly the last 92 days; older needs the archive.
FORECAST_MAX_PAST_DAYS = 90

# Rain: any measurable precipitation, or a rain/shower/thunderstorm WMO code.
RAIN_MIN_MM = 0.1
RAIN_WEATHER_CODES = set(range(51, 68)) | set(range(80, 83)) | set(range(95, 100))
# Possible dust event: high PM10 or dust, with enough wind to be blowing it.
DUST_PM10_UGM3 = 150.0
DUST_DUST_UGM3 = 100.0
DUST_MIN_GUST_KMH = 25.0

_HOURLY_VARS = (
    "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,"
    "precipitation,weather_code,visibility"
)


def _get_json(url: str, params: dict[str, Any]) -> dict:
    full = f"{url}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(full, timeout=HTTP_TIMEOUT_S) as resp:  # noqa: S310 (fixed https hosts)
        return json.loads(resp.read().decode("utf-8"))


def _hour_key(t: str) -> str:
    # Open-Meteo returns "2026-10-29T14:00" for timezone=GMT
    return t[:13] + ":00:00Z"


def classify(row: dict) -> dict:
    """Add rain / dust_event flags and a short human label to a weather row."""
    precip, code = row.get("precip_mm"), row.get("weather_code")
    row["rain"] = bool(
        (isinstance(precip, (int, float)) and precip >= RAIN_MIN_MM)
        or (isinstance(code, (int, float)) and int(code) in RAIN_WEATHER_CODES)
    )
    pm10, dust, gust = row.get("pm10"), row.get("dust"), row.get("gust_kmh")
    dusty = (isinstance(pm10, (int, float)) and pm10 >= DUST_PM10_UGM3) or (
        isinstance(dust, (int, float)) and dust >= DUST_DUST_UGM3
    )
    row["dust_event"] = bool(dusty and isinstance(gust, (int, float)) and gust >= DUST_MIN_GUST_KMH)
    labels = []
    if row["dust_event"]:
        labels.append("Dust event")
    if row["rain"]:
        labels.append("Rain")
    row["condition"] = ", ".join(labels) if labels else "No rain or dust"
    return row


def _fetch_weather(lat: float, lon: float, start: date, end: date) -> dict:
    today = datetime.now(timezone.utc).date()
    url = WEATHER_URL if (today - start).days <= FORECAST_MAX_PAST_DAYS else ARCHIVE_URL
    return _get_json(url, {
        "latitude": lat, "longitude": lon, "hourly": _HOURLY_VARS, "timezone": "GMT",
        "start_date": start.isoformat(), "end_date": end.isoformat(),
    })


def _fetch_air_quality(lat: float, lon: float, start: date, end: date) -> dict:
    return _get_json(AIR_QUALITY_URL, {
        "latitude": lat, "longitude": lon, "hourly": "pm10,dust", "timezone": "GMT",
        "start_date": start.isoformat(), "end_date": end.isoformat(),
    })


def get_hourly_weather(lat: float, lon: float, start: datetime, end: datetime) -> list[dict]:
    """Hourly weather rows (ascending) covering [start, end]. Cached for an hour.

    Dust data is best-effort: if the air-quality call fails, rows are still
    returned with pm10/dust = None (and so no dust_event), rather than failing
    the whole request.
    """
    s, e = start.astimezone(timezone.utc).date(), end.astimezone(timezone.utc).date()
    # Don't ask for hours that haven't happened (the forecast would be returned).
    now = datetime.now(timezone.utc)
    key = f"weather:{round(lat, 3)}:{round(lon, 3)}:{s}:{e}"
    cached = cache.get(key)
    if cached:
        return cached

    wx = _fetch_weather(lat, lon, s, e).get("hourly", {})
    times = wx.get("time", [])
    try:
        aq = _fetch_air_quality(lat, lon, s, e).get("hourly", {})
    except Exception as exc:  # network / unsupported date range
        logger.warning("Air-quality fetch failed, dust flags unavailable: %s", exc)
        aq = {}
    aq_by_time = {
        t: (aq.get("pm10", [None] * len(aq.get("time", [])))[i], aq.get("dust", [None] * len(aq.get("time", [])))[i])
        for i, t in enumerate(aq.get("time", []))
    }

    rows = []
    for i, t in enumerate(times):
        hk = _hour_key(t)
        if datetime.fromisoformat(hk.replace("Z", "+00:00")) > now:
            continue
        pm10, dust = aq_by_time.get(t, (None, None))
        rows.append(classify({
            "hour": hk,
            "temperature_c": wx["temperature_2m"][i],
            "humidity_pct": wx["relative_humidity_2m"][i],
            "wind_kmh": wx["wind_speed_10m"][i],
            "gust_kmh": wx["wind_gusts_10m"][i],
            "precip_mm": wx["precipitation"][i],
            "weather_code": wx["weather_code"][i],
            "visibility_m": wx["visibility"][i],
            "pm10": pm10,
            "dust": dust,
        }))
    cache.set(key, rows, ttl=CACHE_TTL_S)
    return rows
