# How every number in AzAWH is calculated

**Read this first if you are taking over the project.** This folder explains, in
order, every calculation the system performs: from a voltage on a sensor wire to
the figure on a dashboard tile. Each rule is written with its formula, its
constants, the file and function that implement it, **why** it exists, and a
worked example. Where two parts of the system compute the "same" thing slightly
differently, that is called out (see [Known inconsistencies](#known-inconsistencies-read-before-trusting-a-number)).

Verified against the code and live data on **2026-11-12**. The code is the source
of truth; if you change a constant or rule, change it here too.

## The path of a number

```
 sensor signal ──► Pi script ──► Cloud Function ──► Firestore ──► (ingestion worker) ──► Postgres
   (01-edge)      decode/scale     (02-ingestion)     raw readings                        raw readings
                                                          │                                   │
                                                          └────────────┬──────────────────────┘
                                                                       ▼
                                          FastAPI backend: hourly aggregation, quality, efficiency,
                                          alerts, weather            (03-backend-hourly, 04-backend-other)
                                                                       ▼
                                          Dashboard: tiles, charts, compare, envelope, alerts
                                                                       (05-dashboard)
 research_extension/: windows, synthetic faults, models, agents       (06-research-extension)
```

| File | Covers |
|---|---|
| [01-edge-pi.md](01-edge-pi.md) | Decoding each sensor (balance, flow, power meter, anemometers), the pump rule, upload cadence, watchdog/auto-recovery |
| [02-ingestion-and-storage.md](02-ingestion-and-storage.md) | Timestamps, the Cloud Function, Firestore → Postgres worker, lifetime totals job |
| [03-backend-hourly.md](03-backend-hourly.md) | **The core.** `/hourly`: water, energy, flow, energy per litre, harvesting efficiency, absolute humidity |
| [04-backend-other.md](04-backend-other.md) | Data-quality score, daily kWh/L, alert rules and state machine, weather flags, station status, health digest |
| [05-dashboard.md](05-dashboard.md) | Everything the dashboard recomputes: period totals, per-reading charts, compare, envelope, power status, unit conversion |
| [06-research-extension.md](06-research-extension.md) | Phase 1–3: sliding-window features, baseline-relative stats, fault injection, labels, models, metrics, agents |

## Conventions used everywhere

| Topic | Rule |
|---|---|
| Time zone | All stored/API timestamps are **UTC**. Hour buckets are UTC hours (`2026-11-06T15:00:00Z`). The dashboard displays **America/Phoenix (UTC−7, no DST)**; "days" in quality and efficiency are Phoenix-local days (`quality.STATION_TZ`). |
| Which timestamp | Live uploads are stamped with the **server's receive time**, not the Pi's capture time (see 02). |
| Units | temperature °C · humidity % RH · velocity as the instrument's own unit (normally m/s) · weight **grams** (assumed, never checked) · energy kWh (cumulative counter) · flow L/min · water in the API is grams (`water_produced_g`) and litres (`water_produced_L`, 1 g = 1 mL) |
| Missing vs zero | `None`/null means "not measured / excluded", never 0. Charts draw a gap. A real 0 is only used when the system measured nothing happening. |
| Deltas | Water, energy and flow are **differences between consecutive readings**, credited to the hour of the *later* reading (so nothing is lost across hour boundaries or outages). |
| Ratios | Ratios over a period are **ratio of sums** (total energy ÷ total water), never an average of hourly ratios. A near-zero-water hour would otherwise dominate. |
| Optional hardware | Every sensor field may be absent (stations differ). A sensor that never reports is "not installed", not "broken". |

## Known inconsistencies (read before trusting a number)

These are real and deliberate-or-unresolved; none is hidden in the code, but they
surprise people.

1. **Three slightly different water totals.** The same weight series is turned into
   "water produced" three ways:
   - Backend `/hourly` (the reference): noise floor **scaled with the time gap** (25 g per 30 s), plus a 1 L/min plausibility cap.
   - Dashboard per-reading chart "accumulated water" ([05](05-dashboard.md)): **flat 25 g** floor, no cap.
   - Lifetime/Impact total (`compute_lifetime_totals.py`): **flat 25 g** floor, no cap.
   With ~30 s uploads the floors coincide (25 g), so differences are small; with faster uploads (5 s) the backend floor drops to ~4 g and the totals diverge.
2. **Flow meter vs balance disagree.** Since Nov 6 2026 the flow meter reports ~1.8–2.4× the water the balance loses. Nov 5 matched within 4 %. Cause unresolved (air in the pump line, recirculation, or the 7.5 calibration factor — needs a jug test). Treat `water_produced_L` (balance) as the safer production figure and flow as "litres pumped". Since ~Nov 10 the flow meter reads 0 (a `flow_dead` alert covers this).
3. **"Station off" includes idle.** The 0.2 kWh/hour floor marks an hour "off" and nulls `energy_consumed_kWh` (and so energy per litre) even if fans idle at ~190 W. Use `energy_total_kWh` (added 2026-11-12) for energy totals.
4. **Energy counter wraps.** The DEM730P energy register is 16-bit × 0.01 kWh → wraps at **655.35 kWh**. It read 472.19 kWh on 2026-11-12. A wrap becomes a negative delta that is clamped to 0, so only one step is lost, but plan to read the high register word ([01](01-edge-pi.md)).
5. **Balance unit and velocity unit are not converted at the source.** The balance's unit string is parsed and dropped (grams assumed). The anemometer's unit is uploaded as text but its number is not rescaled; the backend converts to m/s only inside the intake-water calculation, and `velocity_mean` / the "running" threshold (0.3) treat the raw number as m/s.
6. **Efficiency numerator is not capped.** The optional expected-production cap (3× expected) clips `water_produced_g` but not `water_captured_g_hourly` (the efficiency numerator). Only the *under*-10 % exclusion nulls both.
7. **`HARVESTING_EFFICIENCY_FORMULA.md` says "0 otherwise"; the code returns `null`.** The code is right: no capture or no valid intake ⇒ excluded, not 0 %.
8. **Hard-coded exclusion window.** Testbed 1, 2026-08-08 → 2026-09-11, is dropped in `main.py::EXCLUDED_DATA_RANGES` *and* separately in `compute_lifetime_totals.py`. Change both.
9. **Ingestion batch size.** Code default `BATCH_SIZE=4000`; CLAUDE.md says 500. Code wins.

## Constants that must stay in sync

| Constant | Value | Defined in | Must match |
|---|---|---|---|
| Weight noise floor | 25 g / 30 s | `backend/main.py` (`WEIGHT_NOISE_FLOOR_G`, rate-scaled) | `dashboard/lib/stationFields.ts` `WEIGHT_NOISE_FLOOR_G` (flat 25 g), `compute_lifetime_totals.py` |
| Station-off energy floor | 0.2 kWh / h | `main.py` `ENERGY_NOISE_FLOOR_KWH` | `dashboard/lib/stationPower.ts` `STATION_OFF_ENERGY_KWH` |
| Energy jump rule | flat ≥ 600 s, > max(3 kW·Δt, 0.5 kWh) | `main.py` `ENERGY_JUMP_*` | `dashboard/lib/energyJumps.ts` |
| Stall catch-up | flat ≥ 600 s and gap ≥ 3600 s and Δ > 0.5 kWh | `main.py` `ENERGY_STALL_CATCHUP_MIN_S` | `energyJumps.ts` |
| Max kWh per hour (efficiency) | 3.0 | `efficiency.py` `MAX_KWH_PER_HOUR` | = `ENERGY_JUMP_MAX_KW` |
| Duct area | 0.18 m² | `main.py` `AWH_DUCT_AREA_M2` | `stationFields.ts` `AWH_DUCT_AREA_M2` (per-station override: `intake_area_m2`) |
| "Running" airflow | 0.3 m/s | `alerting.py`, `AquaPars1*.py` `RUNNING_VELOCITY_MPS` | all three |
| Flow Δt cap | 120 s | `main.py` flow & intake-water loops | `stationChartData.ts` |
| Online threshold | 15 min | `main.py` `STATION_ONLINE_MAX_AGE_SECONDS` | `freshness.ts` `ONLINE_MAX_AGE_SECONDS` |
| Wh-vs-kWh heuristic | 20 kWh × span-hours | `main.py` | `stationPower.ts` `WH_HEURISTIC_THRESHOLD` |
