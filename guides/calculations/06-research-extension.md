# 06 — Research extension (`research_extension/`)

A **personal research project**, frozen at Phase 3 on 2026-10-07 (tag
`research-extension-v1`). It does **not** feed production calculations except
the anomaly overlay on the dashboard (`public/anomalies.json`). Results and honest
caveats: `research_extension/FINDINGS.md` (best attribution F1 **0.415**, 0.499 on
clean windows; the proposal's 0.80 target was not reached). This file documents the
mathematics so the work can be reproduced or extended.

## Phase 1 — streaming features (`phase1_streaming/`)

- `producer.py` replays Postgres rows in time order to Kafka topic `awh-sensor-readings` (`--speed`: scales the original inter-reading delay; each individual sleep is capped at 1 s; `--speed 0` = as fast as possible) or follows live data.
- `consumer.py` (Spark Structured Streaming) computes, per station, **mean / std / min / max** of each sensor over a **30-minute window sliding every 5 minutes**, tolerating late events up to a **10-minute watermark**, and upserts to `windowed_features`.

## Phase 2 — benchmark dataset (`phase2_models/build_benchmark_dataset.py`)

Real data has no anomaly labels, so labelled faults are **injected** into real
readings and the injected column is the ground-truth cause.

### Scope
`FEATURE_COLUMNS = [temperature, humidity, weight, power]` (the four the lab uses;
scoping from 10 → 4 roughly doubled every model's score). Stations 1,2,3,4,5,6,7,9.

### Windows
30-min windows, 5-min step (same as Phase 1), built with pandas. A reading at time
*t* lies in the 6 windows starting at `floor_5min(t) − {0,5,…,25} min`. Windows with
**< 3** readings are skipped (a std from 1–2 samples is ambiguous).

### Baseline-relative statistics
Absolute values don't generalise across a time split (energy accumulates, weight
varies by experiment), so each statistic is expressed relative to a **causal rolling
baseline**:

```
baseline (mean, std) for (station, feature) as of window_start:
    look back BASELINE_HOURS = 24 h of "clean" readings (the feature's own injected-fault periods removed)
    if fewer than MIN_BASELINE_READINGS = 10 → use all history so far
    needs ≥ 2 values, else NaN
safe_std = baseline_std if > 0 else NaN

per window and feature (w = the window's readings):
    rel_mean  = (mean(w) − baseline_mean) / safe_std
    rel_std   = std(w) / safe_std
    rel_min   = (min(w) − baseline_mean) / safe_std
    rel_max   = (max(w) − baseline_mean) / safe_std
    rel_slope = ( mean(second half of w) − mean(first half of w) ) / safe_std      # needs ≥ 4 readings; halves split at n//2
    missing_frac = fraction of NaN in w                                             # exposes dropout
    max_run_frac = longest run of exactly-identical consecutive readings / n        # exposes stuck_at (NaN breaks runs)
```
`baseline` only looks **backward** (no leakage from the window or its fault).

### Real dead-sensor detection (round 10)
A feature whose **daily std < 1e-6 with ≥ 20 readings that day** is a frozen/dead
sensor (e.g. station 3 humidity pinned at 100.0). Consecutive dead days merge into
periods. These are excluded from the baseline and from fault placement (an injected
fault on an already-dead feature is undetectable by construction).

### Fault injection (`inject_synthetic_faults.py`)

| Type | Duration (min, uniform integer) | Effect on the targeted column over the span |
|---|---|---|
| spike | 5–15 | `+ sign · |m|` constant offset, `m = U(4,8) × column_std`, random sign |
| drift | 60–240 | adds a linear ramp from 0 to `m = U(2,5) × column_std` (random sign) |
| stuck_at | 15–120 | value frozen at the first in-span reading |
| dropout | 10–60 | value set to NaN |

Faults are placed at a random reading; up to 20 placement attempts to avoid
overlapping any already-placed fault (station-wide, so no window ever has two
competing causes) or a dead period; spans with < 2 readings are rejected. Number of
faults per station: `max(3, round(target_anomaly_frac × est_windows / 13))` where 13 =
`AVG_WINDOWS_PER_FAULT` (measured: a fault qualifies ~12.6–13.1 windows). The target
fraction is ~17.5 % (an earlier stale constant of 4 had inflated it to ~55 %, making
"always anomalous" score F1 ≈ 0.71).

### Labelling
```
for each window, over faults at the same station:
    overlap_frac = overlap(fault, window) / min(fault_duration, 30 min)
window is_anomaly if best overlap_frac ≥ 0.5  (MIN_OVERLAP_FRACTION)
    → anomaly_type, causal_parameter, fault_id of that fault
else normal, causal_parameter = "none"
```
Normalising by the *shorter* of fault and window keeps long faults (up to 240 min)
labelable (30/240 would never reach 0.5) and short ones strict (must capture most of
the spike).

### Split (time-based, per station, with embargo)
For each station: `t1 = 70th percentile`, `t2 = 85th percentile` of its window starts.
- train: `window_end ≤ t1`
- val: `window_start ≥ t1 + 30 min` and `window_end ≤ t2`
- test: `window_start ≥ t2 + 30 min`

The 30-min embargo (= one window) prevents a window spanning two splits. Per-station
quantiles (not global) because a global cut once left a station with zero validation
windows. Random splits would leak future information into training.

## Phase 2 — models

All consume the `rel_*` columns (`data_prep.py`: NaN → that column's *training* mean;
`missing_frac` already carries the "was missing" signal).

| Model | Detection | Attribution |
|---|---|---|
| **Rule baseline** (`rule_baseline.py`) | z = `|rel_mean − μ| / σ` per feature, with μ,σ fit on **normal** training windows; score = max z; anomaly if score > threshold (tuned 0.5…6.0 step 0.25) | argmax feature |
| **Isolation Forest ensemble** (`isolation_forest_model.py`) | per feature an IsolationForest (200 trees) on 6 columns `rel_mean, rel_std, rel_min, rel_max, missing_frac, max_run_frac`; raw score `−score_samples`; converted to a **percentile rank** against the model's own training-normal scores (`searchsorted(train_scores, raw, 'right') / n`), so scores are comparable across features; window score = max over features; anomaly if > threshold (0.5…0.99) | a second forest per feature on the 6 + `rel_slope`; argmax of percentile ranks (only for windows already flagged). `rel_slope` is kept out of detection because it is noise for dropout/stuck faults |
| `recalibrate(val_df)` | refreshes the percentile reference using later *normal* validation windows (no refit, no test leakage) because features drift over 11 months | – |
| **Joint detector / two-stage** (`joint_detector.py`, `two_stage_model.py`) | one IsolationForest over all stat columns, percentile-rank calibrated (avoids max-of-N inflation) | Isolation-Forest attribution scores for flagged windows |
| **Supervised** (`supervised_classifier.py`) | RandomForest (300 trees, depth 5, min leaf 20, `class_weight="balanced"`); predicted label unless best probability < threshold → "none" (sigmoid calibration was tried and made it worse) | argmax class |
| **LSTM** (`lstm_attribution_model.py`, current best) | input: per window a `30 × 8` array = for each of the 4 features a baseline-normalised value channel (clipped to ±10; missing → 0) plus a 1/0 *present* mask; readings are nearest-neighbour resampled to 30 steps. Bidirectional 1-layer LSTM (hidden 24), concat of both final hidden states → dropout 0.4 → linear to 5 classes (4 features + "none"); cross-entropy with inverse-frequency class weights (normalised to mean 1), Adam lr 1e-3, weight-decay 5e-4, 30 epochs, batch 128. Predicted class unless `max softmax < 0.3` → "none" | argmax class |

Thresholds are **tuned on validation** to maximise detection F1
(`evaluate.py::tune_threshold`), never on test.

### Metrics (`evaluate.py`)
- `detection_f1` = binary F1 of `is_anomaly` vs `is_anomaly_pred`.
- `attribution_f1` = **macro F1** over labels `[temperature, humidity, weight, power, none]` of `causal_parameter` vs prediction (`zero_division=0`). This is the headline RQ1 number.
- `per_fault_type_breakdown`: detection recall and attribution-given-detection accuracy per fault type.
- `bootstrap_ci`: **cluster bootstrap over fault instances** (300 resamples): resample whole faults (all their windows together) with replacement, plus resampled normal windows; report mean and 2.5/97.5 percentiles. Resampling windows directly would pretend thousands of overlapping windows are independent when only ~150–250 faults exist.
- `rotating_kfold_eval.py`: walk-forward folds on the same unsplit window table.
- 32 % of test windows contain *real* missing data (an outage on station 5, no power meter on station 9) — a confound; clean-subset F1 is 0.499 (`FINDINGS.md`).

## Phase 3 — agents (`phase3_agents/`, LangGraph)

| Agent | Calculation |
|---|---|
| `SensorDriftAgent` | loads the saved Isolation Forest ensemble; `is_anomaly`, `causal_parameter`, `confidence = detection_score` for one window's `rel_*` row |
| `ThresholdBreachAgent` | **placeholder sanity bounds, not regulatory limits**: temperature 0–50 °C, humidity 0–100 %, weight 0–20 000 g, power 0–3000 W; a reading below/above is a breach |
| `StakeholderEscalationAgent` | severity: any threshold breach → **high**; anomaly with confidence ≥ 0.7 → **medium**; any anomaly → **low**; else none. Routing text per severity; **logged only, nothing is sent** |
| `IncidentReportAgent` | retrieves top-3 chunks of `guides/*.md` by keyword overlap — score = Σ over query terms of `haystack.lower().count(term)`, highest first (no vector DB); then a local Ollama model (default `qwen2.5:7b`) or Claude writes a summary. An Ollama answer that cites a number **not present in the prompt** is rejected in favour of a deterministic template |

### Dashboard anomaly export (`export_anomalies.py`)
Per station, over the last N days: score windows with the **Isolation Forest only on the sensors the station actually has** (a never-reported sensor has `missing_frac = 1` and would flag every window): `score = max over present features of detection percentile`, `flagged = score > model.threshold`, cause = argmax of attribution scores among present features. Then:

- **Merge** flagged windows whose start is within **10 min** of the running interval's end; interval score = **peak** window score; cause = the **most frequent** blamed parameter; `windows` = count.
- **Plain-language summary** (measured, not model output): compare the parameter's mean inside the interval with the **3 h before**; if `|inside − before| / |before| ≥ 3 %` → "rose/fell from X to Y"; else if inside std > 3 × before std → "unusually variable"; else "behaved unusually"; needs ≥ 3 readings on each side.
- **Reliability guardrails:** a station is **suppressed** if fewer than 200 windows were scored, or if more than **15 %** of its windows are flagged (the model was calibrated on ~20 % injected faults and never validated on real incidents; a high flag rate means it is describing normal behaviour as anomalous).
