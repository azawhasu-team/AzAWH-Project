# 05 — Dashboard (`awh_az/water-station-dashboard/src`)

> **In plain words:** what the website recalculates itself in your browser: the totals on a station page, the charts built from raw readings, the compare page and the on/off indicator. Everything else on the site comes ready-made from the backend. Unfamiliar word? See the [glossary](GLOSSARY.md).

Most dashboard numbers are taken straight from the backend (`/hourly`,
`/efficiency/daily`, `/impact`). The rules below are the ones the **browser
recomputes**. Pure functions live in `src/lib/` and have unit tests next to them
(`*.test.ts`).

## 1. Display conventions

| Item | Rule | File |
|---|---|---|
| Time zone | everything rendered in **America/Phoenix** regardless of the viewer's browser; CSV timestamps `yyyy-MM-dd HH:mm:ss` Phoenix local | `lib/timezone.ts` |
| Volume unit toggle | stored values are always litres; display `L`, `gal` (÷ 3.785411784), `ac-ft` (÷ 1 233 481.85) | `lib/compareMath.ts::convertLiters` |
| Specific energy conversion | energy **per** volume, so the factor is **multiplied** (kWh/L → kWh/gal = × 3.785…, → kWh/ac-ft = × 1 233 481.85) — the exact inverse of the volume conversion | `convertSpecificEnergy` |
| Precision | volume 2 decimals (6 for ac-ft); specific energy 3 decimals (0 for ac-ft, which is enormous) | `formatMeasurementValue` |
| Volume fields converted on charts | `accumulated_water_L`, `accumulated_water_flow_L`, `flow_total`, `flow_lmin` | `lib/stationFields.ts` |

## 2. Freshness and online status (`lib/freshness.ts`)

```
age = now − last_reading
age < 120 s        → "Live"
age < 15 min       → "Delayed"
otherwise          → "Not sending"      (no reading at all → "Waiting for data")
online  = age < 15 min   (matches the backend's active/inactive rule)
```
`formatAge`: `<60 s` → "Ns ago", `<1 h` → "Nm", `<1 day` → "Nh", else "Nd".
Station page status colour: fresh/stale/dead as above; if online but
`stationPowerState == 'off'` the label becomes "Live, but off".

## 3. Station ON/OFF from the energy counter (`lib/stationPower.ts`)

```
take the readings in the 60 min before the newest reading (need ≥ 2 points spanning ≥ 30 min, else "unknown")
total = Σ increments from the jump-aware tracker (§4) over that window
if total > 20: total /= 1000                         # Wh-vs-kWh heuristic (same as backend)
state = total < 0.2 kWh  ? 'off' : 'on'
```
Same 0.2 kWh floor as the backend `ENERGY_NOISE_FLOOR_KWH`. (This is why an idling
station — fans on, ~190 W — can read "off".)

## 4. Energy jump tracker (`lib/energyJumps.ts`)

A port of the backend rule so per-reading charts agree with hourly totals. Feed
valid readings in time order; for each step with `delta > 0`:
```
flat_s = time the counter had been unchanged before this step
sharp  = delta > max( 3 kW · elapsed_h , 0.5 kWh )
stall  = elapsed ≥ 3600 s and delta > 0.5 kWh
if flat_s ≥ 600 s and (sharp or stall):  jump → increment = 0, and the cumulative line is shifted down by `delta`
else increment = delta
adjusted_cumulative = e − Σ(jumps)
```

## 5. Per-reading chart series (`lib/stationChartData.ts::buildChartSeries`)

Used by the raw-data charts (anything plotted per reading, not per hour). Readings
in the selected range are sorted ascending, then:

| Series | Calculation |
|---|---|
| `accumulated_water_L` | running sum of `Δweight` where `Δweight ≥ 25 g` (**flat** floor, no cap), ÷ 1000. Replaces raw weight in the selector |
| `incremental_water_g` | per-reading `Δweight` if ≥ 25 g else 0 |
| `accumulated_water_flow_L` | running sum of the backend's per-reading `flow_volume_L` (every 1 s sample) when present; otherwise running ∫ flow: trapezoid `((f_prev + f)/2) · min(Δt,120 s)/60`, only for `flow_lmin ≥ 0`. Replaces raw `flow_total` (which resets on Pi restart) |
| `energy` (cumulative) | jump-adjusted counter (§4); readings above `ENERGY_SANITY_CEILING_KWH` = 50 000 are treated as missing; on a station that normally reports power, a reading with no power is treated as missing energy |
| `incremental_energy_kWh` | jump-aware per-reading increment |
| `abs_humidity_intake/outtake` | Magnus formula (same as backend) from T and RH |
| `harvesting_efficiency` | per reading: `min( incremental_water_g / (AH · v_mps · A · Δt) · 100 , 100 )` with `Δt = min(gap,120 s)` (30 s for the first point); null if no water was captured or inputs missing |

A missing value is a **gap** in the line, never 0 (a plotted 0 draws false spikes).
These per-reading series use the *flat 25 g* floor, so they can differ slightly from
the backend hourly total (README #1).

## 6. Station page totals and tiles (`app/stations/[id]/page.tsx`)

All are computed from the selected period's hourly rows.

| Tile / value | Formula |
|---|---|
| Total water (mass) | Σ `water_produced_L` (nulls skipped) |
| Total water (flow) | Σ `water_produced_flow_L` |
| Total energy (incl. idle) | Σ `energy_total_kWh ?? energy_consumed_kWh ?? 0` (new 2026-11-12) |
| Energy Consumption (Mass), kWh/L | `Σ energy_consumed_kWh / Σ water_produced_L` (ratio of sums; `null` if water = 0) |
| Energy Consumption (Flow), kWh/L | over **only the hours that have flow data**: `Σ energy / Σ flow_L` where the hour's energy is non-null. Hours without a flow value are excluded from *both* numerator and denominator, otherwise a flow meter that started late would overstate the figure |
| Latest hourly water | scan hours backward for the newest non-null `water_produced_L`; flagged **stale** if that hour is > 2 h old |
| Hourly charts | one point per hour, nulls kept so all hourly charts share one x-axis; specific energy converted with `convertSpecificEnergy` |

## 7. Compare page (`lib/compareMath.ts`)

Measurements: `total`, `production`, `energy`, `efficiency`.

- **Window summary (`summarizeWindow`)** — `waterProducedL` = Σ hourly water; `lastEfficiencyPct` and `lastSpecificEnergyKWhPerL` = the newest non-null hourly value of each **independently**. If the station has a power meter (`power_mean` present) and the energy is null for every row → `offState = 'all'`; null for the last 2 rows → `'now'`. When off, the "latest" snapshots are withheld (they would be stale values from before it switched off).
- **`excludeDowntime`** — for `production` only: hours inside a run of **≥ 2 consecutive hours with exactly 0 L** are dropped, so idle stretches don't drag the mean down ("average output while running" vs "including downtime"). It cannot tell idle from a dead sensor reporting 0.
- **`buildComparisonPoint`** — values = the hourly field (`water_produced_L`, `energy_per_liter_kWh_L`, `harvesting_efficiency_pct_hourly`) non-null only.
  - `total` → sum (no error bar, no "latest").
  - others → `mean` and **sample** standard deviation (`n−1`, 0 if n = 1) of the hourly values, plus `latest` = newest hour; all converted to the display unit.
  - `absHumidity` = plain mean of `abs_humidity_intake_mean` over the same hours.
- **Distributions (`buildDistributionPoint`)** — same values, sorted; quantiles by linear interpolation (numpy default): `pos=(n−1)q; lo=⌊pos⌋; hi=⌈pos⌉; v = s[lo] + (s[hi]−s[lo])(pos−lo)`. Box plot: Q1, median, Q3; **Tukey whiskers** = furthest values within 1.5·IQR of the quartiles; points beyond are outliers.
- **Month compare** — `monthRangeISO('yyyy-MM')` = first instant of the month to last ms of its last day, **UTC** (so a Phoenix-local month boundary is off by up to 7 h).

## 8. Operating envelope (`lib/envelope.ts`, `/envelope` page)

Shows under which air conditions a station performs.
```
usable hour  = temperature_mean, humidity_mean, water_produced_L (≥ 0) and energy_consumed_kWh all present
               (energy null = the backend judged the hour "off")
bin          = ( floor(T/3)·3 °C ,  min( floor(RH/10)·10 , 90 ) % )
cell         = hours, Σ water, Σ energy, water/hour = Σ water / hours,
               kWh/L = Σ energy / Σ water (ratio of sums),  efficiency = MEAN of hourly efficiency values
ranking      : only cells with ≥ 5 hours; faded below 2 hours
best/worst   : energy → lowest/highest kWh/L ; water, efficiency → highest/lowest
spreadFactor = highest value / lowest value among ranked cells (≥ 1, "× better")
goodness(v)  = clamp((v − lo)/(hi − lo), 0..1) over ranked cells; inverted for energy; 0.5 if hi = lo
```

## 9. Efficiency trend on the Stations overview (`lib/efficiencyTrend.ts`)

- Chart rows: one per **complete** Phoenix day, one column per station = that day's `kwh_per_L` (null = gap). Today is excluded (partial).
- Wording (`efficiencyChange`): `|change| < 3 %` → "About the same as the 7 days before"; negative → "▼ N % less energy per litre …" (good); positive → "▲ N % more …" (bad); `null` → "Not enough history". N = `round(|change|)`.

## 10. Power-chart status (`lib/powerStatus.ts`) and alerts (`lib/alerts.ts`)

Operates on the per-reading **power** series. (The live DEM730P station has no
power values, so these detectors are inactive there; they apply to stations whose
meters report W.)

| Detector | Rule |
|---|---|
| zero | value ≤ 0.5 W (`ZERO_POWER_MAX_W`) → off |
| flat run | consecutive readings within 0.05 W (`FLAT_POWER_EPSILON_W`) for ≥ 10 min (`FLAT_POWER_MIN_MINUTES`) → off ("stuck" or steady) |
| jump | a step `|Δ|` bigger than **all** of: 4 × the 90th percentile of the previous ≤ 60 steps (needs ≥ 10), 25 % of the larger of the two levels, and 25 W. Percentile index = `min(n−1, floor(0.9·(n−1)+0.5))` |
| current stretch | an off stretch ending at the newest reading |
| recent jump | within 30 min of the newest reading |

Alert grading (`lib/alerts.ts`): reporting — no reading ≥ 15 min = **critical** "Station not sending data", 2–15 min = **warning** "Readings are delayed"; station off = **info**; off stretch that is still current = **warning**, past = info; jumps within 15 min of an off-stretch edge are start-up/shutdown and ignored; jumps closer than 10 min merge into one cluster; a cluster is a **warning** if it is recent or has ≥ 3 jumps; model-flagged activity = **info**; "station off" is hidden if a current 0 W alert already says it; "recent" = ended within 24 h of the newest reading. Fleet attention (`fleetAttention.ts`) applies the same alert model to the last 24 h of power, only for stations whose admin status is "active".

*These browser alerts are separate from the backend email alerts in 04 §4.*

## 11. Misc helpers

- **Downsampling (`downsample.ts`)** — charts over `maxPoints` keep first/last points and, per bucket, the min, max (and second series' min/max); a gap marker is kept only for a run of **≥ 5** consecutive nulls (a real outage), so isolated missing samples don't chop the line. Peaks always survive.
- **Chart accessible name (`chartSummary.ts`)** — "N points from a to b, range lo to hi, latest x"; digits: ≥100 → 0, ≥10 → 1, else 2 decimals.
- **Weather events/bands (`weatherEvents.ts`)** — consecutive flagged hours (gap ≤ 1 h) merge into an event; shading band = `[first hour, last hour + 1 h)`.
- **Anomaly overlay (`anomalies.ts`)** — model-flagged intervals from `public/anomalies.json`; mapped to charts by parameter (temperature→temperature; humidity→humidity, abs humidity; weight→weight/accumulated water/incremental water; power→power/energy); bands snap to the first/last plotted point inside them; flagged **stale** when the export is ≥ 7 days old (it is a batch export, not live inference — "quiet" means *not checked*).
- **Chunked hourly download (`hourlyChunks.ts`)** — the date range is split into **24 h** pieces cut on whole-hour boundaries (each ends 1 ms before the next starts), fetched **one at a time**; a 404 (no readings) skips the piece; 429/502/503/504 or a network error is retried up to 3 attempts with wait `3 s × attempt`; any other failure aborts (no silent hole in the CSV); rows are de-duplicated by hour and sorted.
- **Landing page** — "days of drinking water" = `round(total_liters / 2)`.
