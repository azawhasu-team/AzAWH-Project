# 01 — Edge layer (Raspberry Pi): turning sensor signals into numbers

Code: `RPi_USB_Package/`. The live station (`station_testbed_1@Powerplant`) runs
`AquaPars1_new_pm.py`; the older variant `AquaPars1.py` differs only in the power
meter reader. See also [Hardware notes in CLAUDE.md §6](../../CLAUDE.md).

## 1. Cadence — what happens how often

| What | Period | Where |
|---|---|---|
| Flow meter sample | **1 s** (`FLOW_SAMPLE_SEC`) | `read_flow.py`, `AquaPars1_new_pm.py:128` |
| Balance / power / anemometers | the **sensor interval** chosen in the operator UI (`self.interval`, default 10 s) | `read_balance.py`, `read_power_new.py` |
| CSV row | every 1 s, whatever sensors have data | `save_data` |
| Cloud upload | every `interval` seconds (`_last_cloud_upload_ts`); the live station currently uploads about every **30 s** (median gap 30.3 s measured 2026-11-12; earlier in Nov it was ~5 s) | `save_data` |
| Watchdog poll | 5 s (`WATCHDOG_POLL_SEC`) | watchdog loop |

Because the cloud cadence is configurable, **never hard-code "one reading per 30 s"
in downstream math**: the backend always uses the real time difference between
readings.

## 2. Balance (water weight)

`read_balance.py::parse_balance_line`. The scale prints ASCII lines at 9600 baud.
Three formats are accepted:

| Example line | Parsed as |
|---|---|
| `ST,GS,+ 0.0000kg` | stable flag `ST`, `GS`, sign, weight 0.0, unit `kg` |
| `ST,GS,OK 123.45 g` | weight 123.45, unit `g` |
| `S,+    1.5 g` | weight 1.5, unit `g` |

Whitespace is collapsed first. Anything else logs a parse error and is skipped.

> **Important assumption:** the parsed weight is uploaded **as-is**; the unit
> string is *not* uploaded and *not* converted. The backend treats `weight` as
> **grams**. The balance must be set to grams. If it were set to kg every water
> number would be 1000× too small, silently.

`weight` is the **tank weight** (tare + water), not the water mass. Water
produced is derived from *increases* in this value ([03](03-backend-hourly.md), §3).

## 3. Pump rule (`pump_controller.py`)

Not a 30-second cycle. On **every balance reading** `auto_check(weight)` runs:

```
if weight > threshold_g  and  pump is not already ON:
    turn ON for duration_min   (timed run in a background thread)
```

- `threshold_g` and `duration_min` come from the operator UI (options 1000–6000 g,
  1–6 min; defaults 2000 g / 2 min). The values in use are saved to
  `station_state/last_config.json`.
- When the timed run ends the pump turns OFF; the very next balance reading that
  is still above the threshold starts it again. So while weight stays above the
  threshold the pump is ON back to back.
- `pump_status` uploaded = `1` if the pump flag is ON at that instant else `0`.

**`pump_status` is a software flag, not proof water moved.** On 2026-11-06 it was
ON 93 % of the day while the flow meter registered water for only ~18 minutes
(the pump was "on" with nothing to pump). It is **not used in any calculation**.
It is only a display/diagnostic field.

## 4. Flow meter (`read_flow.py`, GPIO 22)

YF-S201-style pulse sensor. Rising edges are counted on a pull-down input.

```
every 1 s:
    elapsed   = measured seconds since last sample            (not the nominal 1.0)
    hz        = pulses / elapsed
    flow_lmin = hz / CALIBRATION_FACTOR                        CALIBRATION_FACTOR = 7.5
    total_L  += flow_lmin * elapsed / 60                       integrated volume
```

- `7.5` means **7.5 Hz per L/min** (a typical YF-S201 datasheet value, **never
  verified on this unit**). To calibrate: pour a known volume, then
  `new_factor = 7.5 × litres_the_meter_read ÷ litres_actually_poured`.
- `flow_total` is the integrated volume **since the reader started**; it resets
  to 0 whenever the Pi restarts or the watchdog restarts the flow reader. That is
  why the dashboard and backend never use `flow_total` and instead re-integrate
  `flow_lmin` ([03](03-backend-hourly.md), §6).
- **What is uploaded each cycle** (`save_data`): `flow_lmin` = **mean** of all 1 s
  samples since the last upload; `flow_hz` = mean Hz; `flow_total` = current
  integrated total; `flow_samples_lmin` = the list of every 1 s value (capped at
  3600). The backend's hourly water-from-flow uses only the mean `flow_lmin`; the
  per-second list is stored for diagnostics.
- If no flow data has ever arrived, fields are `None` (not 0).

## 5. Power meter (DEM730P, `read_power_new.py`)

Modbus RTU over RS485. The DEM730P's official register map exposes **only total
energy**, so the station uploads `voltage/current/power = None` by design (that is
*not* a fault).

```
raw        = read_register(0x0000)         one 16-bit word, function code 3
energy_kWh = round(raw * 0.01, 2)          confirmed on-site 2026-07-14: raw 8024 ↔ LCD 80.2 kWh
```

- Resolution is **0.01 kWh**; the counter only changes in steps of 0.01.
- **Wrap-around:** 16 bits × 0.01 = **655.35 kWh**. The counter read 472.19 kWh on
  2026-11-12. After the wrap the value drops to ~0; the backend turns that
  negative step into 0 (so one 30-s step is lost, nothing worse). A future fix is
  to read register `0x0001` as the high word.
- **Stale guard:** if the last power reading is older than `READER_STALE_SEC` =
  45 s, `save_data` uploads `None` instead of re-sending the frozen number (a
  stuck reader once looked like genuine flat consumption).

Older meter (`read_power.py`, used by `AquaPars1.py`) reads a different device:

| Quantity | Formula |
|---|---|
| Voltage V | `raw * 0.1` |
| Current A | `(hi * 65536 + lo) * 0.001` |
| Power W | `(hi * 65536 + lo) * 0.1` |
| Energy kWh | `(hi * 65536 + lo) / 1000` (the register is Wh) |

## 6. Anemometers (`intake_anemometer.py`, `outtake_anemometer.py`)

Both decode a 16-byte binary packet that starts with `0xEB 0xA0`. Bytes (0-based):
`2` = mode, `3` = unit, `4–5` humidity, `6–7` temperature, `8–13` velocity.
(The two scripts are identical except the USB **by-path** string used to find
the right adapter: intake `usb-0:1.2:1.0`, outtake `usb-0:1.1:1.0`. If a cable
moves to another physical port, update the string.)

| Quantity | Formula (as implemented) | Meaning |
|---|---|---|
| Temperature °C | `(raw − 0x0238) × (27.3 − 26.8) / (0x023D − 0x0238) + 26.8` = `0.1·(raw − 568) + 26.8` | linear two-point fit: raw 568 ↔ 26.8 °C, raw 573 ↔ 27.3 °C; 0.1 °C per count |
| Humidity % | `(raw − 0x0141) × (32.3 − 32.1) / (0x0143 − 0x0141) + 32.1` = `0.1·(raw − 321) + 32.1` | raw 321 ↔ 32.1 %, raw 323 ↔ 32.3 %; 0.1 % per count |
| Velocity | `v = mean(v1, v2, v3) × (1.53 / 152) − 0.01`, rounded to 0.01 | v1,v2,v3 are three 16-bit values; 152 = `0x98` |
| Unit | byte 3 when mode byte = 0: `0x00` m/s, `0x04` km/h, `0x08` MPH, `0x0C` ft/m, `0x10` ft/s | the string is uploaded as `unit` / `outtake_unit` |

Notes:
- The temperature and humidity lines are **hard-coded two-point calibrations**
  against reference readings, not manufacturer formulas. If an anemometer is
  replaced it must be re-calibrated and the change logged in the Calibrations page.
- The code computes a unit conversion factor but **discards it**; the velocity
  number is not rescaled. The unit string rides along so the backend can convert
  (`_velocity_to_mps`) where physics needs m/s.
- No valid packet within 2 s → returns `None, None, None, "m/s"`.

## 7. Watchdog and auto-recovery

`AquaPars1_new_pm.py` watchdog + `auto_recovery.py::PowerRecovery`:

| Rule | Constant | Action |
|---|---|---|
| A reader gave no data for ≥ 45 s | `READER_STALE_SEC` | restart that reader (balance, power or flow) |
| Power/voltage missing ≥ 120 s **on a meter that normally reports power** | `POWER_NULL_RESTART_SEC` | escalate (below) |
| Energy counter unchanged ≥ 600 s **while the fans run** (intake velocity ≥ 0.3 m/s) | `ENERGY_STUCK_RESTART_SEC`, `RUNNING_VELOCITY_MPS` | escalate (below) |

Escalation ladder: restart the power reader up to **3×**; then restart the whole
program (re-exec with `--autostart` and the saved settings). Program restarts are
capped at **3 per hour** so an unfixable fault cannot loop. Any good reading
resets the reader-restart count. "Energy stuck" is **not** judged when the fans
are off (flat energy is then normal).

A meter "normally reports power" only after the first reading containing power
or voltage; the DEM730P never does, so only the energy-stuck rule applies to it.

## 8. Upload path (`cloud_uploader.py`)

Durable, non-blocking: each reading is first written to a local SQLite queue
(max 100 000 rows ≈ 69 days at 1/min), then POSTed by a background thread.

- Every reading gets a random `reading_id` (the Firestore document id), so a
  retry after an ambiguous timeout cannot create a duplicate.
- Success (2xx) or a permanent client error (4xx other than the retryable ones)
  removes the row; a network error or HTTP 5xx keeps it and retries with backoff
  **5 s → doubling → 60 s max**. HTTP 401/403 (wrong/rotated station key) is
  **retried, never dropped**, so readings stay queued until the key is fixed.
- A reading sent within **120 s** (`LIVE_MAX_AGE_SEC`) of capture is "live" — no
  timestamp is sent and the server stamps it. An older one is a replay: it is sent
  with `replayed: true` and its `client_timestamp` **only if the Pi's clock was
  NTP-synced when it was captured**; otherwise it is dropped (it remains in the
  local CSV) because a Pi has no real-time clock and an unsynced time may be badly
  wrong. The server additionally accepts a client timestamp only within
  [now − 30 days, now + 5 min] ([02](02-ingestion-and-storage.md)).
