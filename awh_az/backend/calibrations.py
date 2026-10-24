"""Recalibration log: when a sensor was recalibrated or replaced.

A step change in a series right after a calibration is a measurement change,
not a change in the weather or the machine. Events live in a top-level
Firestore collection `calibrations` (one doc per event), looked up by station.
Pure helpers here; the Firestore calls are small and take the client as an
argument so they are easy to fake in tests.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional

COLLECTION = "calibrations"
SENSOR_CHOICES = (
    "intake anemometer",
    "outtake anemometer",
    "balance",
    "power meter",
    "flow meter",
    "pump",
    "other",
)


class CalibrationError(ValueError):
    pass


def validate_event(payload: dict, today: Optional[date] = None) -> dict:
    """Normalise and validate a new event. Raises CalibrationError."""
    today = today or datetime.now(timezone.utc).date()
    raw_date = str(payload.get("date", "")).strip()
    try:
        d = date.fromisoformat(raw_date)
    except ValueError:
        raise CalibrationError("date must be YYYY-MM-DD")
    if d > today:
        raise CalibrationError("date cannot be in the future")
    sensor = str(payload.get("sensor", "")).strip().lower()
    if sensor not in SENSOR_CHOICES:
        raise CalibrationError(f"sensor must be one of: {', '.join(SENSOR_CHOICES)}")
    note = str(payload.get("note", "") or "").strip()
    if len(note) > 500:
        raise CalibrationError("note is limited to 500 characters")
    return {"date": d.isoformat(), "sensor": sensor, "note": note}


def list_events(db, station_name: str) -> list[dict]:
    """Newest first. Filters in Python so no composite Firestore index is needed."""
    docs = db.collection(COLLECTION).where("station_name", "==", station_name).stream()
    events = []
    for doc in docs:
        data = doc.to_dict() or {}
        events.append({"id": doc.id, **data})
    events.sort(key=lambda e: (e.get("date", ""), e.get("created_at", "")), reverse=True)
    return events


def add_event(db, station_name: str, payload: dict) -> dict:
    event = validate_event(payload)
    event["station_name"] = station_name
    event["created_at"] = datetime.now(timezone.utc).isoformat()
    _, ref = db.collection(COLLECTION).add(event)
    return {"id": ref.id, **event}


def delete_event(db, event_id: str) -> bool:
    ref = db.collection(COLLECTION).document(event_id)
    if not ref.get().exists:
        return False
    ref.delete()
    return True


def last_calibration_date(events: list[dict]) -> Optional[str]:
    return max((e["date"] for e in events if e.get("date")), default=None)
