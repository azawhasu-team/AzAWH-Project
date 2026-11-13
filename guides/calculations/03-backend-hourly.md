# 03 — Backend hourly aggregation (`GET /stations/{station}/hourly`)

> **In plain words:** the most important file. It explains how the website's hourly numbers (water, energy, energy per litre, efficiency) are worked out from the raw readings. The key idea: every number is the difference between two consecutive readings, added up for each hour. Start with [00-START-HERE.md](00-START-HERE.md) if you are new. Unfamiliar word? See the [glossary](GLOSSARY.md).

**This is the core of the analytics.** Implemented in
`awh_az/backend/main.py::_compute_hourly_aggregation_sync` (≈ lines 920–1500).
Everything the dashboard shows as "water produced", "energy consumed",
"energy per litre" and "harvesting efficiency" for a period comes from here.
The same function feeds the alerts, the data-quality score and the daily
efficiency trend ([04](04-backend-other.md)).

Verified on live data 2026-11-12: flow and energy totals reproduced exactly from
the raw readings.

## 0. Pipeline overview

```
fetch raw readings ──► drop excluded windows ──► sort by time ──► (A) bucket by UTC hour
                                                          └──► (B) one pass over ALL readings computing
                                                                   pairwise deltas: water, energy, flow,
                                                                   intake-water, credited to the LATER
                                                                   reading's hour
              (A)+(B) ──► per-hour row: means/std, abs humidity, water, energy, energy/L, flow,
                          efficiency
```

**Why pairwise deltas credited to the later reading** (not computed inside each
hour): an hour-by-hour calculation silently loses the step that crosses the hour
boundary, and after a multi-day outage it lost the whole accumulated change (it once
cost ~98 kWh over an 8-day gap on Testbed 1). Now a gap-spanning change lands as one
lump in the reconnection hour; the rules below stop such lumps from being
mistaken for real production/consumption.

### Fetch
- If a Postgres pool exists: `SELECT time, <17 columns> FROM measurements WHERE station_id=… AND time BETWEEN … ORDER BY time` (timestamps converted to UTC ISO strings).
- Otherwise Firestore: `stations/{name}/readings` ordered by `timestamp`, `.select(["timestamp", *READING_COLUMNS])`, paged by `max_query_limit`. `.select` shrinks each page (drops the per-second flow array) but **does not reduce the number of billed document reads**.
- `READING_COLUMNS` = temperature, humidity, velocity, unit, outtake_temperature, outtake_humidity, outtake_velocity, outtake_unit, weight, pump_status, voltage, power, energy, current, flow_lmin, flow_hz, flow_total.

### Excluded windows
`EXCLUDED_DATA_RANGES` drops readings whose timestamp string lies in `[start,end)`.
Currently only Testbed 1, `2026-08-08 → 2026-09-11` (data judged invalid). The first
reading **after** a dropped stretch is flagged `_after_exclusion`; when seen, the
loop **resets** the last-valid weight and energy pointers (and skips the flow term) so
no delta is bridged across the excluded period.

### Hour bucket
`hour_key = timestamp[:13] + ":00:00Z"` — the first 13 characters of the UTC ISO
string (`2026-11-06T15`). This is why every timestamp **must** be UTC. An hour row
exists only if at least one reading falls in it.

## 1. Mean and standard deviation of raw fields

Fields (`AGGREGATION_FIELDS`): `temperature, humidity, velocity, outtake_temperature, outtake_humidity, outtake_velocity, power, current, voltage`.

```
values   = [r[f] for readings in the hour if r[f] is a number (not null)]
f_mean   = round( Σ values / n , 4 )
f_std    = round( sqrt( Σ (v − mean)² / (n − 1) ) , 4 )      # sample std (n−1); 0.0 if n = 1
```
If `n = 0`, both are `null`. Weight, energy, flow and pump_status are **not**
averaged (they are handled as deltas below). Velocity is averaged in whatever unit
was uploaded.

## 2. Absolute humidity (g/m³) — intake and outtake

Magnus approximation, per reading, then mean/std over the hour:

```
e_s  = 6.112 · exp( 17.67·T / (T + 243.5) )              # saturation vapour pressure (hPa), T in °C
AH   = 216.7 · (RH/100) · e_s / (273.15 + T)              # g of water vapour per m³ of air
```
Both T and RH must be present. Std uses `n − 1` (or 1 if n ≤ 1).
Fields: `abs_humidity_intake_mean/_std`, `abs_humidity_outtake_mean/_std`.

*Example:* T = 30 °C, RH = 20 % → e_s = 42.456 hPa → AH = 216.7·0.20·42.456/303.15 = **6.07 g/m³**.

## 3. Water produced from the balance

Fields: `water_produced_g`, `water_produced_L`, `water_captured_g_hourly`.
Input: consecutive **valid** (non-null) weight readings. A null weight does not
break the chain; the pointer stays on the last valid value so the real delta
across the null is kept.

For each valid weight `w` with previous valid weight `w_prev` (time gap `Δt`
seconds):

```
Δw = w − w_prev
if Δw > 0:                               # only increases count; drops (pump draining) are ignored
    Δw = min(Δw, 1000/60 · Δt)           # plausibility cap: 1 L/min = 16.67 g/s ⇒ rate-limited gain
    floor = 25/30 · Δt   if Δt < 3600 s  # "25 g per 30 s" noise floor, scaled by the gap
            25 g         if Δt ≥ 3600 s  # after a real outage, flat 25 g
    if Δw ≥ floor:  credit Δw to the hour of the later reading
```

Why each rule exists:
- **Only positive deltas:** the tank is emptied by the pump; a drop is not "negative production". Net gain = sum of rises.
- **Noise floor:** the balance jitters ±5–25 g with no real trend. Summing every positive wobble once overcounted a station's 2-day output ~50×. The floor is a *rate* (25 g/30 s ≈ 0.83 g/s) so a 5 s or 20 min gap still faces a proportional floor — a real small drip is not zeroed just because the step wasn't exactly 30 s. After an outage (> 1 h) real accumulation has a tiny per-second rate, so a scaled floor would wrongly erase it; the flat 25 g is used instead.
- **Rate cap (1 L/min):** a larger implied rate is more likely a balance reset, calibration bump or manual refill than real harvest; the gain is **capped (partial credit), not dropped**. 1 L/min is a working estimate, not a validated hardware limit.

*Floors for common gaps:* 5 s → 4.2 g · 10 s → 8.3 g · 30 s → 25 g · 60 s → 50 g.
*Example:* weight 5000 → 5040 g in 30 s: Δw = 40 ≥ 25 ✔ credited 40 g. 5000 → 5020: 20 < 25 → ignored.

Hour value:
```
water_produced_g = round(Σ credited Δw in the hour, 4)        # null if no pair ended in this hour (distinct from a real 0)
water_produced_L = round(water_produced_g / 1000, 6)          # 1 g = 1 mL
```

### Optional expected-production guard (only if the admin set `expected_production_g_per_min` on the station)
```
expected_per_hour = expected_g_per_min · 60
if water_produced_g > 3 · expected_per_hour:  clip to 3 · expected_per_hour      # sensor glitch
elif water_produced_g < 0.10 · expected_per_hour:                                 # not really running
        water_produced_g = null ;  water_captured_g_hourly = null ; efficiency = null
```
(With no expected rate set, none of this applies.)

## 4. Energy consumed

Fields: `energy_consumed_kWh`, `energy_total_kWh`. Input: the cumulative energy
counter (`energy`, kWh).

For each valid energy reading `e` with previous valid `e_prev` (gap `Δt` s):

```
Δe        = max(e − e_prev, 0)                    # a drop (counter reset/wrap) counts as 0
flat_s    = how long the counter had been unchanged just before this step
sharp     = Δe > max( 3 kW · Δt/3600 , 0.5 kWh )  and  flat_s ≥ 600 s     # "jump out of a flat stretch"
stall     = flat_s ≥ 600 s  and  Δt ≥ 3600 s  and  Δe > 0.5 kWh            # frozen meter catching up after a gap
if not (sharp or stall):  hour_delta[hour of later reading] += Δe ;  span_hours += Δt/3600
```

Why: a frozen meter (the DEM730P failure mode) can sit flat and then leap by
everything it missed. That lump would land in one hour (e.g. **26.4 kWh** from 3
readings on 2026-10-30), wrecking energy per litre. A genuinely continuous meter
is unaffected: the rules only fire after the counter was flat ≥ 10 minutes. The
0.5 kWh floor protects stations that still upload raw Wh (where ordinary steps are
tens of units). *Example from live data:* on 2026-11-07 08:21 the counter jumped
**+2.66 kWh in 30 s** (≈ 320 kW, impossible) → classed as a jump and excluded.

**Power-gap rule:** if the station *normally reports power* (any reading in the
range has numeric `power`) but this reading has `power = null`, the meter wasn't
reporting; its energy is dropped and the baseline restarts, so the energy accumulated
across such a stretch is left out instead of landing as one lump. A meter that
**never** reports power (the DEM730P) is exempt.

Hour value:
```
span          = max(span_hours_in_hour, 1)
threshold     = 20 kWh · span
energy_kwh    = Δ_hour / 1000  if Δ_hour > threshold  else  Δ_hour          # Wh-vs-kWh heuristic
energy_total_kWh    = round(energy_kwh, 4)                                   # everything the meter counted (jumps removed), idle included
energy_consumed_kWh = round(energy_kwh, 4)  if energy_kwh ≥ 0.2  else null   # "station off" floor
```
- **Wh heuristic:** some drivers uploaded raw Wh; no station draws >20 kWh/h, so a larger hourly delta is assumed to be Wh and divided by 1000. The threshold scales with the time the delta spans so a legitimate multi-day catch-up isn't mis-divided.
- **0.2 kWh/h floor ("off"):** stations draw ~1–1.5 kW when producing. An hour under 0.2 kWh is treated as the station being off/idle: `energy_consumed_kWh` is `null`, which also removes the hour from energy per litre and from the Compare page. **`energy_total_kWh` keeps the idle energy** (added 2026-11-12). Verified: on 2026-11-11 raw counter moved 4.60 kWh at ~0.19 kWh/h (fans only); `energy_consumed_kWh` summed to 0.2, `energy_total_kWh` to 4.60.
- Resolution caveat: the meter only moves in 0.01 kWh steps (~190 s at 190 W), so very short windows look "flat".

## 5. Energy per litre (mass-based)

```
if water_produced_g > 0 and energy_consumed_kWh (not null) > 0:
      energy_per_liter_kWh_L = round( energy_consumed_kWh / (water_produced_g/1000) , 4 )
else: null
```
Uses the **floored** energy, so idle hours (no water anyway) never produce a ratio.
Lower is better (typical running value on Testbed 1 ≈ 0.7 kWh/L).

## 6. Water produced by the flow meter

Field: `water_produced_flow_L`. Independent of the balance, so the two can be compared.

**Preferred (since 2026-11-13): every 1 s sample.** If the reading carries the Pi's
per-second list `flow_samples_lmin`, the reading's litres are `Σ max(sample,0) / 60`
(each entry is the L/min over one second), credited to the hour of that reading. Both
read paths select it (Firestore `.select`, and the Postgres `flow_samples_lmin REAL[]` column,
02 §Postgres). Readings without a list (older rows, stations without the sensor) use the
fallback below. On 5–10 Nov 2026 data the two methods
differ by under 1 % per day (the dashboard's accumulated-flow chart uses the same
rule via the per-reading field `flow_volume_L`).

**Fallback (no per-second list):**
```
for each reading i with flow_lmin ≥ 0 (a number) and not _after_exclusion:
    f_avg  = (flow_lmin_i + flow_lmin_{i−1})/2   if the previous reading also has a flow value ≥ 0
             flow_lmin_i                          otherwise
    Δt     = min( seconds since the immediately previous reading , 120 )
    flow_L[hour of i] += f_avg · Δt / 60
```
- **Δt cap 120 s:** flow is an instantaneous *rate*; a long gap (outage/restart) must not be credited with continuous flow.
- `flow_lmin` as uploaded is already the **mean** of the Pi's 1 s samples for that interval (01 §4), so this is the integral of a piecewise-constant mean; accurate when uploads are ≤ 120 s apart. If the upload interval ever exceeds 120 s, volume would be under-counted.
- Hour is `null` (not 0) if it contained no flow readings (station without a flow meter).
- Verified 2026-11-12: backend daily totals equal the meter's own cumulative `flow_total` to within 0.5 %.

### Energy per litre (flow-based)
```
energy_per_liter_flow_kWh_L = round( energy_consumed_kWh / water_produced_flow_L , 4 )   if flow_L > 0 and energy_consumed_kWh else null
```

> If the flow meter over-reads (see README #2) this ratio is **understated**; if the
> pump is on with an empty tank it can also be inflated by air. Prefer the mass-based
> figure until the flow meter is validated.

## 7. Harvesting efficiency

Question: of the water that passed through the duct as vapour, how much did the
machine capture? (Full derivation also in `HARVESTING_EFFICIENCY_FORMULA.md`.)

**Intake-available water** per reading pair (credited to the later reading's hour):
```
Δt     = min( seconds since the immediately previous reading (regardless of its validity), 120 )
v_mps  = velocity converted to m/s via the `unit` string (km/h ÷3.6, mph ÷2.23694, ft/s ÷3.28084, ft/m ÷196.850394)
W_in   = AH_intake · v_mps · A · Δt          [ g/m³ · m/s · m² · s = g ]
         only if temperature, humidity and velocity are numbers, humidity > 0, velocity > 0, AH > 0, v_mps > 0
A      = 0.18 m²  (273.6 in² duct) unless the station doc has intake_area_m2 > 0
```
**Captured water** = the same noise-floored positive weight deltas as §3 (before any expected-production clip).

```
harvesting_efficiency_pct_hourly = min( Σ captured / Σ W_in × 100 , 100 )      # ratio of hourly SUMS
   null if captured = 0 or Σ W_in = 0  (the station is not producing; NOT reported as 0 %)
intake_available_water_g_hourly  = Σ W_in   (null if 0)
water_captured_g_hourly          = Σ captured (0.0 if none; null if the hour was excluded by the 10 % rule)
```
Worked example (30 s steps, T=30 °C, RH=20 %, v=2.0 m/s, A=0.18 m²): AH = 6.07 g/m³ →
W_in per 30 s = 6.07·2·0.18·30 = **65.5 g**; per hour (120 steps) = **7.87 kg**. If the
tank gained 1.0 L that hour: efficiency = 1000/7866 = **12.7 %**.

Why a ratio of sums: an average of per-reading percentages is dominated by
near-zero-intake readings. The 100 % cap guards against balance jitter against a tiny
intake value.

## 8. Output row (all fields)

`hour, reading_count, {temperature,humidity,velocity,outtake_temperature,outtake_humidity,outtake_velocity,power,current,voltage}_{mean,std}, abs_humidity_{intake,outtake}_{mean,std}, water_produced_g, water_produced_L, water_produced_flow_L, energy_consumed_kWh, energy_total_kWh, energy_per_liter_kWh_L, energy_per_liter_flow_kWh_L, intake_available_water_g_hourly, water_captured_g_hourly, harvesting_efficiency_pct_hourly`.

Result is cached 600 s per `(station, start, end)`; `404` if no readings.

## 9. Incremental cache used by alerts and efficiency (`_cached_hourly`)

Alert runs and `/efficiency/daily` do not re-read the whole window each time:
- First call: compute hours for the whole window (3 days for alerts; 7–60 for efficiency).
- Later calls: re-read only from `floor_hour(last_fetch) − 2 min` (the 2 min gives the first reading a baseline for its deltas) to now; rows for older hours are kept (complete hours cannot change); rows older than the window are dropped; on error the cache is untouched.
- Cache is **in memory**, so a Render restart means one full re-read. This cut Firestore reads from ~410 K to ~20 K per day.
