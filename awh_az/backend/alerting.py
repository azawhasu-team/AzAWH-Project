"""Alert evaluation and notification (Slack / email) with acknowledge and snooze.

The dashboard's alerts panel only helps while someone is looking at it. This
module runs on a schedule (see POST /admin/alerts/evaluate), decides what is
wrong across the fleet, and tells people once - not every run:

* a NEW alert notifies immediately,
* an open alert re-notifies only every `reminder_hours`,
* an ACKNOWLEDGED alert stays quiet until it clears,
* a SNOOZED alert stays quiet until the snooze ends,
* when an alert clears, one "resolved" message is sent.

Notifications carry signed one-click acknowledge / snooze links, so nobody
needs a login or an API key to silence an alert from their phone.

Pure logic first (testable); thin I/O wrappers last.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import smtplib
import urllib.request
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Optional

logger = logging.getLogger(__name__)

STATE_COLLECTION = "alert_state"
NO_FLOW_MAX_L = 0.05  # an hour with less flow-meter volume than this counts as "no flow"
RUNNING_VELOCITY_MPS = 0.3  # intake airflow at/above this (m/s) means the station is running
SNOOZE_CHOICES_HOURS = (1, 4, 24)
LINK_TTL_HOURS = 72


@dataclass(frozen=True)
class Alert:
    id: str  # stable per (station, rule); severity may change without changing identity
    station: str
    display_name: str
    rule: str
    severity: str  # "warning" | "critical"
    title: str
    detail: str


# --------------------------------------------------------------------------
# Rules
# --------------------------------------------------------------------------
def _parse(ts) -> Optional[datetime]:
    if not ts:
        return None
    try:
        d = datetime.fromisoformat(ts.replace("Z", "+00:00")) if isinstance(ts, str) else ts
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def expected_live(stations: list[dict], now: datetime, lookback_days: float, explicit: dict[str, float]) -> dict[str, float | None]:
    """Stations that SHOULD be reporting: listed explicitly, or reported within
    the lookback window (so stations retired months ago never alert).
    Value = per-station max-silent minutes override, or None for the default."""
    out: dict[str, float | None] = {}
    for s in stations:
        name = s["station_name"]
        if name in explicit:
            out[name] = explicit[name]
            continue
        last = _parse((s.get("metadata") or {}).get("last_reading"))
        if last and (now - last) <= timedelta(days=lookback_days):
            out[name] = None
    return out


def power_status(hourly_rows: list[dict]) -> dict:
    """From a station's hourly rows (oldest first): does its meter normally report
    power, and for how many of the most recent hourly buckets has it not?

    A meter that never reports power (the DEM730P only exposes energy) is
    reports_power=False and is never a fault."""
    def has_power(r):
        v = r.get("power_mean")
        return isinstance(v, (int, float)) and not isinstance(v, bool)

    reports = any(has_power(r) for r in hourly_rows)
    missing = 0
    for r in reversed(hourly_rows):
        if has_power(r):
            break
        missing += 1

    # Station on/off from energy: an hour with no energy consumed (under the
    # backend's noise floor, same rule as the dashboard's "Station is off") is an
    # off hour. Only meaningful for a station that has consumed energy in the window.
    def used_energy(r):
        v = r.get("energy_consumed_kWh")
        return isinstance(v, (int, float)) and not isinstance(v, bool) and v > 0

    reports_energy = any(used_energy(r) for r in hourly_rows)
    off = 0
    for r in reversed(hourly_rows):
        if used_energy(r):
            break
        off += 1

    # Same trailing no-energy hours, but only those where the fans were moving air:
    # the meter is not counting while the station is clearly running, which is a
    # stuck/dead meter, not "turned off".
    def running(r):
        v = r.get("velocity_mean")
        return isinstance(v, (int, float)) and not isinstance(v, bool) and v >= RUNNING_VELOCITY_MPS

    # "Counting" here means the meter registered anything at all (energy_total_kWh,
    # idle draw included), not the floored figure: a station idling at ~190 W is on
    # and its meter is fine. Older rows without the field fall back to the floored one.
    def counting(r):
        v = r.get("energy_total_kWh", r.get("energy_consumed_kWh"))
        return isinstance(v, (int, float)) and not isinstance(v, bool) and v > 0

    stuck = 0
    for r in reversed(hourly_rows):
        if counting(r) or not running(r):
            break
        stuck += 1
    # Flow meter: trailing hours where it reported (a number, even 0) but registered
    # (almost) nothing WHILE THE STATION WAS PRODUCING. "Producing" = the hour's
    # energy cleared the 0.2 kWh/h floor (energy_consumed_kWh is set). Fans alone
    # (idle, ~0.19 kWh/h) make no water, so zero flow then is expected; and the
    # balance wobbles ~0.5-1 L/h from jitter on an idle unit, which must not be
    # mistaken for production (11 Nov 2026: false alarm). A non-producing hour
    # ends the run. The run's balance-measured water is returned for evaluate()
    # as a second check that water was really there to pump.
    def flow_l(r):
        v = r.get("water_produced_flow_L")
        return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None

    reports_flow = any(flow_l(r) is not None for r in hourly_rows)
    no_flow = 0
    no_flow_water = 0.0
    for r in reversed(hourly_rows):
        f = flow_l(r)
        if f is None or f >= NO_FLOW_MAX_L or not used_energy(r):
            break
        no_flow += 1
        w = r.get("water_produced_L")
        if isinstance(w, (int, float)) and not isinstance(w, bool):
            no_flow_water += w
    return {
        "reports_power": reports, "missing_hours": missing, "reports_energy": reports_energy,
        "off_hours": off, "stuck_hours": stuck if reports_energy else 0,
        "reports_flow": reports_flow, "no_flow_hours": no_flow if reports_flow else 0,
        "no_flow_water_l": round(no_flow_water, 2),
    }


def evaluate(
    stations: list[dict],
    quality_latest: dict[str, dict],
    now: datetime,
    *,
    stale_minutes: float = 120,
    lookback_days: float = 7,
    explicit: Optional[dict[str, float]] = None,
    quality_threshold: int = 60,
    power: Optional[dict[str, dict]] = None,
    power_missing_hours: int = 2,
    off_hours: int = 2,
    no_flow_hours: int = 6,
    no_flow_min_water_l: float = 2.0,
) -> list[Alert]:
    """Active alerts right now. `quality_latest` maps station -> its latest
    COMPLETE day from quality.daily_quality (yesterday), if any."""
    explicit = explicit or {}
    live = expected_live(stations, now, lookback_days, explicit)
    by_name = {s["station_name"]: s for s in stations}
    alerts: list[Alert] = []
    for name, override in sorted(live.items()):
        s = by_name.get(name, {"station_name": name})
        display = s.get("display_name") or name
        limit = override or stale_minutes
        last = _parse((s.get("metadata") or {}).get("last_reading"))
        if last is None:
            alerts.append(Alert(f"{name}|stale", name, display, "stale", "critical", f"{display}: no readings received", "The station has never reported."))
        else:
            silent_min = (now - last).total_seconds() / 60
            if silent_min > limit:
                hours = silent_min / 60
                sev = "critical" if silent_min > max(limit * 3, 360) else "warning"
                alerts.append(
                    Alert(
                        f"{name}|stale", name, display, "stale", sev,
                        f"{display}: not sending data",
                        f"Last reading {hours:.1f} h ago (alert after {limit / 60:.1f} h).",
                    )
                )
        ps = (power or {}).get(name)
        stale_now = any(a.id == f"{name}|stale" for a in alerts)
        nf_hrs = (ps or {}).get("no_flow_hours", 0)
        if ps and not stale_now and nf_hrs >= no_flow_hours and ps.get("no_flow_water_l", 0) >= no_flow_min_water_l:
            alerts.append(
                Alert(
                    f"{name}|flow_dead", name, display, "flow_dead",
                    "critical" if nf_hrs >= 24 else "warning",
                    f"{display}: flow meter reading zero",
                    f"The flow meter has registered no water for about {nf_hrs} h, but the balance shows "
                    f"about {ps['no_flow_water_l']:.1f} L was collected in that time, so water is being "
                    "produced and should be flowing. Check the flow sensor wiring/signal and that the pump "
                    "is actually moving water.",
                )
            )
        if ps and ps["reports_power"] and ps["missing_hours"] >= power_missing_hours:
            hrs = ps["missing_hours"]
            alerts.append(
                Alert(
                    f"{name}|power_missing", name, display, "power_missing",
                    "critical" if hrs >= 6 else "warning",
                    f"{display}: power meter not reporting",
                    f"Power/voltage missing for about {hrs} h. Its energy is left out of consumption "
                    "until it returns. The station restarts the meter reader by itself; if this "
                    "persists, check the meter wiring.",
                )
            )
        # Off for the last `off_hours` hourly buckets (the latest, possibly partial,
        # plus the last full hour). Skipped when the power meter itself is the
        # problem: its energy is excluded then, which would look like "off".
        power_fault = bool(ps and ps["reports_power"] and ps["missing_hours"] >= power_missing_hours)
        stuck_hrs = (ps or {}).get("stuck_hours", 0)
        energy_stuck = bool(ps and ps.get("reports_energy") and stuck_hrs >= off_hours and last is not None)
        if energy_stuck:
            alerts.append(
                Alert(
                    f"{name}|energy_stuck", name, display, "energy_stuck",
                    "critical" if stuck_hrs >= 6 else "warning",
                    f"{display}: energy meter not updating",
                    f"No energy counted for about {stuck_hrs} h although the fans are running, so the "
                    "station is on but the meter is stuck. That stretch is left out of consumption. "
                    "The station restarts the meter reader by itself; if this persists, check the meter "
                    "and its USB/RS485 connection.",
                )
            )
        if ps and ps.get("reports_energy") and ps.get("off_hours", 0) >= off_hours and not power_fault and not energy_stuck and last is not None:
            alerts.append(
                Alert(
                    f"{name}|station_off", name, display, "station_off", "warning",
                    f"{display}: station turned off",
                    f"The station is still reporting but has drawn under 0.2 kWh per hour (off or idle) for about {ps['off_hours']} h. "
                    "You will get a RESOLVED email when it is running again.",
                )
            )
        q = quality_latest.get(name)
        if q and q.get("score") is not None and q["score"] < quality_threshold:
            names = ", ".join(sorted({i["sensor"] for i in q.get("issues", []) if i["kind"] in ("frozen", "dead")})) or "low coverage"
            alerts.append(
                Alert(
                    f"{name}|low_quality", name, display, "low_quality", "warning",
                    f"{display}: poor data quality on {q['date']}",
                    f"Score {q['score']}/100 ({q.get('coverage_pct', '?')}% of hours reported). Problem: {names}.",
                )
            )
    return alerts


# --------------------------------------------------------------------------
# State machine: which alerts to announce this run
# --------------------------------------------------------------------------
def plan(alerts: list[Alert], state: dict[str, dict], now: datetime, reminder_hours: float = 12):
    """Returns (notifications, new_state).

    notifications: list of (kind, alert_or_state_dict) with kind in
    new | reminder | escalated | resolved. State is {alert_id: entry}.
    """
    iso = now.isoformat()
    new_state = {k: dict(v) for k, v in state.items()}
    notes: list[tuple[str, dict]] = []
    active_ids = set()

    for a in alerts:
        active_ids.add(a.id)
        cur = new_state.get(a.id)
        body = asdict(a)
        if cur is None or cur.get("status") != "open":
            new_state[a.id] = {**body, "status": "open", "first_seen": iso, "last_notified": iso, "acked_at": None, "snoozed_until": None}
            notes.append(("new", body))
            continue

        escalated = cur.get("severity") == "warning" and a.severity == "critical"
        cur.update({k: body[k] for k in ("severity", "title", "detail", "display_name")})
        snoozed = _parse(cur.get("snoozed_until"))
        if snoozed and snoozed > now:
            continue
        if escalated:
            cur["last_notified"] = iso
            cur["acked_at"] = None
            notes.append(("escalated", body))
            continue
        if cur.get("acked_at"):
            continue
        last = _parse(cur.get("last_notified")) or now
        if now - last >= timedelta(hours=reminder_hours):
            cur["last_notified"] = iso
            notes.append(("reminder", body))

    for aid, cur in list(new_state.items()):
        if cur.get("status") == "open" and aid not in active_ids:
            cur["status"] = "resolved"
            cur["resolved_at"] = iso
            notes.append(("resolved", dict(cur)))
    return notes, new_state


def apply_action(entry: dict, action: str, now: datetime, hours: Optional[float] = None) -> dict:
    """Acknowledge or snooze one state entry. Raises ValueError on bad input."""
    out = dict(entry)
    if action == "ack":
        out["acked_at"] = now.isoformat()
    elif action == "snooze":
        if hours not in SNOOZE_CHOICES_HOURS:
            raise ValueError(f"snooze hours must be one of {SNOOZE_CHOICES_HOURS}")
        out["snoozed_until"] = (now + timedelta(hours=hours)).isoformat()
    else:
        raise ValueError("action must be 'ack' or 'snooze'")
    return out


# --------------------------------------------------------------------------
# Signed one-click links
# --------------------------------------------------------------------------
def make_token(secret: str, alert_id: str, action: str, hours: Optional[int], now: datetime) -> str:
    payload = {"a": alert_id, "x": action, "h": hours, "e": int((now + timedelta(hours=LINK_TTL_HOURS)).timestamp())}
    body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    sig = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def verify_token(secret: str, token: str, now: datetime) -> Optional[dict]:
    if not secret or not token or "." not in token:
        return None
    body, _, sig = token.rpartition(".")
    expected = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
    except (ValueError, json.JSONDecodeError):
        return None
    if int(payload.get("e", 0)) < now.timestamp():
        return None
    return payload


# --------------------------------------------------------------------------
# Messages
# --------------------------------------------------------------------------
_KIND_PREFIX = {"new": "ALERT", "reminder": "STILL OPEN", "escalated": "ESCALATED", "resolved": "RESOLVED"}


def build_message(kind: str, alert: dict, base_url: str, secret: str, now: datetime) -> tuple[str, str, str]:
    """Returns (subject, plain_text, slack_text)."""
    prefix = _KIND_PREFIX[kind]
    sev = f" [{alert['severity']}]" if kind != "resolved" else ""
    subject = f"{prefix}{sev}: {alert['title']}"
    lines = [subject, alert.get("detail", "")]
    slack = [f"*{subject}*", alert.get("detail", "")]
    if kind != "resolved" and base_url and secret:
        links = [("Acknowledge", "ack", None)] + [(f"Snooze {h}h", "snooze", h) for h in SNOOZE_CHOICES_HOURS]
        plain_links, slack_links = [], []
        for label, action, h in links:
            token = make_token(secret, alert["id"], action, h, now)
            url = f"{base_url.rstrip('/')}/admin/alerts-action?token={token}"
            plain_links.append(f"{label}: {url}")
            slack_links.append(f"<{url}|{label}>")
        lines += ["", *plain_links]
        slack.append(" | ".join(slack_links))
    return subject, "\n".join(lines), "\n".join(slack)


# --------------------------------------------------------------------------
# Channels (I/O)
# --------------------------------------------------------------------------
def send_slack(webhook_url: str, text: str, timeout: float = 10) -> None:
    req = urllib.request.Request(
        webhook_url, data=json.dumps({"text": text}).encode(), headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 - URL is operator-configured
        resp.read()


def send_email(host: str, port: int, user: str, password: str, sender: str, recipients: list[str], subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = subject, sender, ", ".join(recipients)
    msg.set_content(body)
    with smtplib.SMTP(host, port, timeout=15) as smtp:
        smtp.starttls()
        if user:
            smtp.login(user, password)
        smtp.send_message(msg)


def send_email_brevo_api(api_key: str, sender: str, recipients: list[str], subject: str, body: str, timeout: float = 15) -> None:
    """Send over Brevo's HTTPS API (port 443). Hosts such as Render's free tier block
    the SMTP ports, so this is the way to send mail from there."""
    payload = json.dumps({
        "sender": {"email": sender, "name": "AWH Station Alerts"},
        "to": [{"email": r} for r in recipients],
        "subject": subject,
        "textContent": body,
    }).encode()
    req = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email", data=payload, method="POST",
        headers={"api-key": api_key, "content-type": "application/json", "accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 - fixed https URL
        if resp.status >= 300:
            raise RuntimeError(f"Brevo API answered {resp.status}")


def undo_failed(new_state: dict, previous: dict, failed_notes: list) -> dict:
    """Put back the previous state for alerts whose notification went nowhere, so the
    next run tries again instead of treating them as already announced."""
    out = dict(new_state)
    for _kind, alert in failed_notes:
        aid = alert["id"]
        if aid in previous:
            out[aid] = previous[aid]
        else:
            out.pop(aid, None)
    return out


def deliver(settings, kind: str, alert: dict, now: datetime) -> dict:
    """Send one notification on every configured channel. Never raises: a down
    Slack must not stop the email, nor the evaluation run."""
    subject, plain, slack = build_message(kind, alert, settings.public_base_url, settings.alert_link_secret or settings.admin_api_key, now)
    results = {"subject": subject, "channels": {}}
    if settings.alert_slack_webhook_url:
        try:
            send_slack(settings.alert_slack_webhook_url, slack)
            results["channels"]["slack"] = "sent"
        except Exception as e:  # noqa: BLE001
            logger.warning("Slack alert failed: %s", e)
            results["channels"]["slack"] = f"failed: {e}"
    recipients = [r.strip() for r in settings.alert_email_to.split(",") if r.strip()]
    if settings.alert_brevo_api_key and recipients:
        try:
            send_email_brevo_api(
                settings.alert_brevo_api_key, settings.alert_email_from or settings.alert_smtp_user,
                recipients, subject, plain,
            )
            results["channels"]["email"] = "sent"
        except Exception as e:  # noqa: BLE001
            logger.warning("Email alert (Brevo API) failed: %s", e)
            results["channels"]["email"] = f"failed: {e}"
    elif settings.alert_smtp_host and recipients:
        try:
            send_email(
                settings.alert_smtp_host, settings.alert_smtp_port, settings.alert_smtp_user,
                settings.alert_smtp_password, settings.alert_email_from or settings.alert_smtp_user,
                recipients, subject, plain,
            )
            results["channels"]["email"] = "sent"
        except Exception as e:  # noqa: BLE001
            logger.warning("Email alert failed: %s", e)
            results["channels"]["email"] = f"failed: {e}"
    if not results["channels"]:
        logger.info("ALERT (no channel configured): %s", subject)
        results["channels"]["log"] = "logged"
    return results


# --------------------------------------------------------------------------
# Firestore-backed state
# --------------------------------------------------------------------------
def _doc_id(alert_id: str) -> str:
    return hashlib.sha1(alert_id.encode()).hexdigest()  # noqa: S324 - not security-sensitive; ids contain '/'-unsafe chars


def load_state(db) -> dict[str, dict]:
    out = {}
    for doc in db.collection(STATE_COLLECTION).stream():
        data = doc.to_dict() or {}
        if data.get("id"):
            out[data["id"]] = data
    return out


def save_state(db, state: dict[str, dict], previous: dict[str, dict]) -> None:
    """Writes only entries that changed."""
    for aid, entry in state.items():
        if previous.get(aid) != entry:
            db.collection(STATE_COLLECTION).document(_doc_id(aid)).set(entry)
