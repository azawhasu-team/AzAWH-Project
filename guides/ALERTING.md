# Alert notifications, calibration log, and data-quality score

Three features that make the dashboard useful when nobody is looking at it.

## 1. Alert notifications (Slack / email, acknowledge, snooze)

`POST /admin/alerts/evaluate` (admin key) looks at the whole fleet and notifies people **once**, not every run.

| Situation | What happens |
|---|---|
| New alert | Notify immediately |
| Still open | Reminder every `ALERT_REMINDER_HOURS` (12) |
| Acknowledged | Silent until it clears |
| Snoozed (1 / 4 / 24 h) | Silent until the snooze ends |
| Warning becomes critical | Notify again (breaks through an acknowledge, not a snooze) |
| Clears | One "RESOLVED" message |

Rules today:
- **Station not sending data**: silent longer than `ALERT_STALE_MINUTES`, critical once silent for 3x that or 6 h.
- **Poor data quality**: yesterday's score below `ALERT_QUALITY_THRESHOLD`.
- **Station turned off**: still reporting but no energy used for about 2 hours (same idea as the dashboard's "Station is off"). When it runs again you get a RESOLVED email, which is the "turned on" message.
- **Energy meter not updating**: no energy counted for about 2 hours while the intake fans are moving air (>= 0.3 m/s), so the station is on but the meter is stuck (the DEM730P failure: the Pi keeps sending the last value, so it never looks null). Critical after 6 h. Replaces "turned off" in that case. The Pi also restarts the meter reader by itself after 10 minutes of unchanged energy while the fans run (`auto_recovery.py`), then the whole program if that does not help.
- **Flow meter reading zero**: the flow meter has registered under 0.05 L for 6+ hourly buckets in a row (`ALERT_NO_FLOW_HOURS`, default 6) while the station was producing (energy at or above the 0.2 kWh/h floor; fans-only idling does not count and ends the run) and the balance measured at least 2 L of water collected in that stretch, so water is being produced but is not flowing. Critical after 24 h. Not raised for stations with no flow meter, when nothing was collected (night / off), or while the station is already "not sending data". Checks: flow sensor wiring/signal, and that the pump is actually moving water. (A plain "pump on, no flow" rule was rejected: the pump flag is on whenever weight is above the threshold, so on a healthy day it is on ~90% of the time while water flows only minutes.)
- **Power meter not reporting**: a meter that normally reports power/voltage has sent none for `ALERT_POWER_MISSING_HOURS` (2) hours. Meters that never report power (DEM730P, energy only) are never flagged, and a power-meter fault is not also reported as "turned off".

A station is *expected live* if it reported within `ALERT_LOOKBACK_DAYS` (7), so retired stations never alert. Override or add stations with `ALERT_EXPECTED_LIVE='{"station_name": 90}'` (max silent minutes).

The dashboard's richer power alerts (stuck, zero, unstable power) are still computed in the browser and are not part of the notifications yet.

### Configuration (backend environment)

```
PUBLIC_BASE_URL=https://az-awh-monitoring-system.onrender.com   # for the ack/snooze links
ALERT_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...     # optional
ALERT_SMTP_HOST=smtp.gmail.com  ALERT_SMTP_PORT=587              # optional
ALERT_SMTP_USER=...  ALERT_SMTP_PASSWORD=...  ALERT_EMAIL_FROM=...  ALERT_EMAIL_TO=a@x.edu,b@x.edu
ALERT_LINK_SECRET=<long random>      # signs the links; falls back to ADMIN_API_KEY
ALERT_BREVO_API_KEY=...              # optional: send email over HTTPS (Brevo API) instead of SMTP
```

**Render's free tier blocks the SMTP ports (25/465/587)**, so SMTP sends there time out ("failed: timed out"). Set `ALERT_BREVO_API_KEY` (Brevo -> SMTP & API -> API keys) and the backend sends over HTTPS instead; it is used in preference to SMTP when set, with `ALERT_EMAIL_FROM` as the sender (a verified Brevo sender) and `ALERT_EMAIL_TO` as recipients.

A notification that no channel delivered is **not** recorded as announced, so the next run retries it.

With no channel configured, alerts are only written to the log. Each channel fails independently: a down Slack never blocks the email.

### Acknowledge and snooze

Every notification contains one-click links (Acknowledge, Snooze 1h / 4h / 24h). They are signed, expire after 72 h, and can only do what the token says, so no login is needed from a phone. API equivalents: `POST /admin/alerts/ack` and `/admin/alerts/snooze` with `{"id": "<station>|stale", "hours": 4}`; `GET /admin/alerts` lists state.

### Scheduling

`.github/workflows/monitor.yml` job `alerts` runs `scripts/trigger_alerts.py` at :07 and :37 every hour. Add a repository secret **`AWH_ADMIN_KEY`** (the backend's `ADMIN_API_KEY`). Test first with a dry run, which sends and saves nothing:

```
AWH_ADMIN_KEY=... python3 scripts/trigger_alerts.py --dry-run
```

State lives in the Firestore collection `alert_state`.

## 2. Calibration log

Admin page -> a station -> **Calibrations**: record a date, the sensor, and a note. Stored in the Firestore collection `calibrations`.

- The station page's Data quality panel outlines the recalibration days and lists the events.
- Envelope page, single station: **Only since last calibration** drops readings from before the latest recalibration.

API: `GET /stations/{name}/calibrations`, `POST /admin/stations/{name}/calibrations`, `DELETE /admin/calibrations/{id}`.

## 3. Daily data-quality score

`GET /stations/{name}/quality?days=7` returns, per Phoenix-local day, a 0-100 score:

`coverage % (hours with data / 24)  -  20 per frozen or dead sensor  -  up to 20 for impossible values`

Good >= 85, fair >= 60, poor below. Sensors checked: intake/outtake temperature and humidity. Frozen = identical value all day (>= 6 hours of data); dead = works on other days but silent today; a sensor that never reports in the window is treated as not installed. Shown as a badge on station cards and a 14-day strip on the station page. Today is judged against the hours elapsed so far.

Not covered yet: balance, flow and power-meter checks, and anything that needs the Phase 2 learned models.
