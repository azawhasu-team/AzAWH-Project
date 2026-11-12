# 04 — Backend: everything except `/hourly`

Files: `quality.py`, `efficiency.py`, `alerting.py`, `weather.py`, `calibrations.py`,
and endpoints in `main.py`. All of these take the **hourly rows** from
[03](03-backend-hourly.md) as input. Pure functions (no I/O) are marked ◆.

## 1. Station status in `GET /stations`

Per station: read the newest **50** readings (descending).
- `available_fields` = every key with a non-null value in those 50 readings, minus `SKIP_FIELDS`. (So a sensor that has been silent for 50 readings drops out of the list.)
- `last_reading` = newest reading's timestamp; `total_readings` here is just `min(50, …)`, **not** a lifetime count.
- `status = "active"` if `now − last_reading < 15 min` (`STATION_ONLINE_MAX_AGE_SECONDS = 900`) else `"inactive"`.
- Result cached 30 s. Display name, hidden flag, `expected_production_g_per_min`, `intake_area_m2` come from the station document (admin-editable).

Location label: text after `@` in the station name, `.strip().title()` (so "PowerPlant" and "Powerplant" display identically).

## 2. Daily data-quality score ◆ (`quality.daily_quality`, `GET /stations/{n}/quality`, cached 600 s)

"Can I trust this station's data on day X?" One entry per **Phoenix-local day** with data.

Inputs: hourly rows. Sensors checked: intake temperature (−30…70 °C), intake humidity (0…100.5 %), outtake temperature (−30…90 °C), outtake humidity (0…100.5 %).

A sensor is **present** if any hourly `_mean` in the window is numeric ("never reports" = not installed, not dead).

Per day:
```
expected_hours = 24                       (for today: now_local.hour + 1, so a morning snapshot isn't penalised for the afternoon)
coverage       = min(100, 100 · hours_with_data / expected_hours)
frozen  issue  : a present sensor with ≥ 6 hourly means whose max − min < 1e-6          → -20
dead    issue  : a present sensor with NO hourly mean today (works on other days)        → -20
range   issue  : hours with a mean outside the plausible range                           (reported; penalty below)
range_penalty  = min(20, 100 · out_of_range_sensor_hours / hours_in_day)
score          = clamp( coverage − 20·(#frozen + #dead sensors) − range_penalty , 0, 100 )   (rounded)
label          = good if score ≥ 85, fair if ≥ 60, else poor
```
Used by the dashboard badges and by the `low_quality` alert (score < 60, on the latest *complete* day).

## 3. Daily energy per litre ◆ (`efficiency.daily_energy_per_liter`, `GET /efficiency/daily?days=7..60`)

```
use an hour only if energy_consumed_kWh and water_produced_L are both numbers, ≥ 0, and energy ≤ 3.0 kWh   # 3 kW = max draw; larger = catch-up lump
day (Phoenix-local) = Σ energy, Σ water, hours
kwh_per_L = Σ energy / Σ water    if Σ water ≥ 0.5 L and Σ energy > 0, else null
complete  = (date < today)                                   # today is partial
```
Ratio of daily sums, **only over hours where both are known** (so a stretch with a stuck/missing energy meter can't make the day look artificially efficient). Uses the floored `energy_consumed_kWh`.

**Trend (`trend_summary`)** — only complete days with a value:
```
latest   = newest valid day
baseline = mean of the previous up-to-7 valid days
change_pct = round( (latest − baseline)/baseline · 100 , 1 )     negative = more efficient
```
The endpoint builds each station from the incremental in-memory hourly cache; if a station isn't cached yet, a background job reads it and the response says `warming: true` (the dashboard polls every 5 s). Cache refresh interval 600 s.

## 4. Alerts (`alerting.py`, run on a schedule by GitHub Actions `monitor.yml` → `POST /admin/alerts/evaluate`)

### 4.1 Which stations are checked (`expected_live`)
A station is *expected live* if it is listed in `ALERT_EXPECTED_LIVE` (JSON, per-station silence limit in minutes) **or** its last reading is within `ALERT_LOOKBACK_DAYS` = 7 days. Retired stations therefore never alert. Each run analyses **3 days** of hourly rows per station (`ALERT_ANALYSIS_DAYS`), fetched once and shared by all rules.

### 4.2 Hourly-derived status (`power_status`, from the 3-day hourly rows, oldest first)
All counts are *trailing* hours (count back from the newest hour until the condition breaks):

| Output | Definition |
|---|---|
| `reports_power` | any row has numeric `power_mean` |
| `missing_hours` | trailing rows with no `power_mean` |
| `reports_energy` | any row with `energy_consumed_kWh > 0` |
| `off_hours` | trailing rows without `energy_consumed_kWh > 0` (i.e. under the 0.2 kWh floor) |
| `stuck_hours` | trailing rows where the meter counted nothing (`energy_total_kWh`, falling back to `energy_consumed_kWh`, is ≤ 0/null) **and** `velocity_mean ≥ 0.3` m/s (fans running); `0` if `reports_energy` is false |
| `reports_flow` | any row with a numeric `water_produced_flow_L` (even 0) |
| `no_flow_hours` | trailing rows with `water_produced_flow_L < 0.05 L` **while producing** (`energy_consumed_kWh` set, i.e. ≥ 0.2 kWh/h); stops at a null, at flow ≥ 0.05, or at an idle/off hour — only if `reports_flow` |
| `no_flow_water_l` | sum of the **balance** `water_produced_L` over those same trailing rows |

### 4.3 Rules (`evaluate`) — defaults in parentheses

| Rule id | Fires when | Severity |
|---|---|---|
| `stale` | no `last_reading` ever (critical); or silent longer than `limit` (`ALERT_STALE_MINUTES`=120 min, or the per-station override) | warning; **critical** if silent > max(3·limit, 360 min) |
| `power_missing` | `reports_power` and `missing_hours ≥ 2` (`ALERT_POWER_MISSING_HOURS`) | warning; critical if ≥ 6 h. Meters that never report power (DEM730P) never fire it |
| `energy_stuck` | `reports_energy` and `stuck_hours ≥ 2` (fans running, meter not counting) and the station has a last reading | warning; critical if ≥ 6 h. **Suppresses `station_off`** |
| `station_off` | `reports_energy` and `off_hours ≥ 2`, no power fault, not energy-stuck | warning. Means "under 0.2 kWh/h (off or idle)" |
| `flow_dead` | `no_flow_hours ≥ 6` (`ALERT_NO_FLOW_HOURS`) **and** `no_flow_water_l ≥ 2.0` **and** no active `stale` for that station | warning; critical if ≥ 24 h |
| `low_quality` | the latest complete day's score < 60 (`ALERT_QUALITY_THRESHOLD`) | warning |

Design notes:
- `energy_stuck` looks at `energy_total_kWh` (not the floored value) so a station idling at ~190 W is not falsely called "stuck".
- `flow_dead` deliberately uses the **balance** to prove water was available. A plain "pump ON but no flow" rule was rejected: the pump flag is ON whenever weight is above the threshold (≈ 90 % of a healthy day) while water actually flows only minutes (01 §3).
- `flow_dead` only counts hours when the station was **producing** (energy ≥ 0.2 kWh/h). On 2026-11-10 06:00 energy fell from ~0.8 to ~0.19 kWh/h (fans only) at the same hour flow went to 0, so zero flow was expected; the balance still showed 0.5–2 L/h of jitter on that idle unit, which the first version of the rule mistook for production (false alarm, fixed 2026-11-12). Consequence: a flow meter that dies while the machine is genuinely off is not caught until the machine runs again.
- Backtest on 2026-11-05…12 live data: silent on healthy days and silent after the machine stopped on Nov 10.

### 4.4 State machine (`plan`) — which alerts to *send*
State is persisted per alert id in Firestore (`alert_state`). Each run compares active alerts to saved state:

| Situation | Notification |
|---|---|
| alert not open before | `new` (state: open, first_seen, last_notified) |
| open, severity warning → critical | `escalated` (clears any acknowledgement) |
| open, snoozed (`snoozed_until > now`) | none |
| open, acknowledged | none |
| open, not acked/snoozed, `now − last_notified ≥ 12 h` (`ALERT_REMINDER_HOURS`) | `reminder` |
| was open, no longer active | `resolved` (status → resolved) |

Delivery: Brevo HTTPS API (Render's free tier blocks SMTP ports 25/465/587; port 2525 works for Brevo SMTP), optional Slack webhook. If channels were configured but none returned "sent", the alert is **not recorded as announced** (`undo_failed`), so the next run retries.

**One-click links:** HMAC-signed tokens `{alert_id, action, hours, expiry}`; valid **72 h** (`LINK_TTL_HOURS`); snooze choices **1, 4, 24 h**; `ack` stops reminders until the alert resolves.

## 5. Weather (`weather.py`, `GET /stations/{n}/weather`)

Open-Meteo (free). Hourly UTC rows with the same key format as `/hourly` (`YYYY-MM-DDTHH:00:00Z`), cached 3600 s per rounded coordinates and date range. Forecast API for dates ≤ 90 days ago, archive API beyond. Hours in the future are dropped. Coordinates: per-location override (`weather_location_coords` JSON keyed by the location label) else a default.

Flags (`classify`):
```
rain       = precip_mm ≥ 0.1   OR   weather_code in {51–67, 80–82, 95–99}
dusty      = pm10 ≥ 150 µg/m³  OR   dust ≥ 100 µg/m³
dust_event = dusty AND wind_gust ≥ 25 km/h          # "possible dust event", NOT an official NWS declaration
condition  = "Dust event, Rain" / "Rain" / "Dust event" / "No rain or dust"
```
If the air-quality call fails the rows are still returned with `pm10 = dust = null` (so no dust flags).

## 6. Calibration log (`calibrations.py`)
Not a calculation: events `{date (≤ today), sensor ∈ {intake anemometer, outtake anemometer, balance, power meter, flow meter, pump, other}, note ≤ 500 chars}` are stored in the `calibrations` collection. The dashboard marks a step change after a calibration date as a *measurement* change, not weather or machine behaviour.

## 7. Station health digest (`scripts/station_health_digest.py`, local Postgres)

Daily, change-only report. For each station over the last **24 h** (`STALE_HOURS` = 6):
- `never` — no readings; `silent` — newest reading older than 6 h; else `live`.
- Sensor checks only on a *live* station with ≥ 30 rows in 24 h (`MIN_ROWS_FOR_SENSOR_CHECK`): **dead** if all values null for `temperature`, `humidity`, `weight`; **power meter dead** if power, voltage *and* energy are all null (DEM730P: only energy exists); **frozen** if `temperature`, `humidity`, `outtake_temperature`, `outtake_humidity` have ≥ 1 non-null value but exactly **one distinct** value.
- Only *changes* since the last run are reported (`diff_state`): new_live, went_silent, recovered, sensor/sensor_cleared. If every previously-live station goes silent at once the finding is "global" (suspect the ingestion worker or DB, not the stations).
- An optional local Ollama model only rephrases findings; if it cites a number that isn't in the findings, the deterministic template is used.

## 8. Caching summary (`cache.py`; in-process fallback — Redis was never provisioned in prod)

| Data | TTL |
|---|---|
| `/stations` | 30 s |
| `/readings` | 10 s if latest-N query, else 180 s |
| `/hourly` | 600 s |
| `/stations/{n}/quality` | 600 s |
| `/impact` | 300 s |
| weather | 3600 s |
| efficiency per-station rows | refreshed when older than 600 s |
