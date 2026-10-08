# Research Extension: Findings

Status: **Phases 1-3 complete; Phases 4-5 not pursued** (decision 2026-10-07). This is a personal
project, not tied to a degree or publication commitment. The full state is tagged
`research-extension-v1`.

The original aim was a multi-agent MLOps framework that detects and attributes multi-sensor anomalies
at the AzAWH stations (see CLAUDE.md section 3). The honest outcome: the platform, data and tooling
work, but attribution accuracy came out far below the proposal's target, and the later phases lack
the data they need.

## What was built

| Phase | What | Where |
|---|---|---|
| 1 | Kafka producer (replay/live from Postgres), Spark Structured Streaming windowed features, MLflow setup | `phase1_streaming/` |
| 2 | Labeled benchmark (synthetic faults injected into real data, time-based split), rule baseline, Isolation Forest ensemble, supervised classifier, two-stage model, LSTM | `phase2_models/` |
| 3 | LangGraph multi-agent system: drift, threshold, incident-report (RAG, local Ollama or Claude), escalation (simulated routing only) | `phase3_agents/` |

## Results (test set: 7,352 windows, 8 stations, temperature/humidity/weight/power)

Target from the proposal: attribution F1 > 0.80, with a rule baseline below 0.65.

| Model | Attribution F1 | Detection F1 |
|---|---|---|
| Rule baseline | 0.227 | 0.059 |
| Isolation Forest ensemble | 0.356 | 0.502 |
| Two-stage | 0.315 | n/a |
| Supervised classifier | 0.369 | n/a |
| **LSTM (best attribution)** | **0.415** | 0.414 |

RQ1's 0.80 target was not reached. Attribution F1 was 0.184 at the start of the July 2026 tuning
sessions and 0.415 after 14 rounds across five model families (full history: PENDING_TASKS.md Part C).
The rule baseline's detection F1 is so low that "baseline below 0.65" holds trivially, so beating it
says little.

## What was learned

1. **Data quality moved the numbers more than modeling did.** Frozen and dead sensors sat inside the
   "clean" reference data and contaminated every early result (rounds 10-11). A stale local database
   hid six stations with real data (round 12). Scoping the benchmark to the four features the lab
   actually uses roughly doubled every model's score (round 13).
2. **Real missing data confounds the benchmark** (2026-10-07,
   `phase2_models/analyze_missing_data_effect.py`). Labels come only from injected faults, but 32% of
   test windows (2,358) have another feature at least 50% missing for real reasons: station 5's
   temperature and humidity outage (Apr 29 to May 5 2026, 1,650 windows, 22% of the test set) and
   station 9 never having a power meter. The detectors, which use `missing_frac`, flag these
   windows: 80% of them versus 12% of clean normal windows.

   | Subset | LSTM attribution F1 | Isolation Forest attribution F1 |
   |---|---|---|
   | Clean windows (68%) | 0.499 | 0.499 |
   | Pre-existing missing data (32%) | 0.251 | 0.240 |
   | Full test set | 0.415 | 0.356 |

   So the honest ceiling on clean data is about 0.50, still short of 0.80, and the isolation forest's
   detection F1 is inflated by missing-data windows (0.502 full, 0.430 clean). Flagging a real outage
   is correct operationally; it is scored as a false positive only because the benchmark has no label
   for it. Fix not applied: relabel real outages as their own class and report clean-subset F1.
3. **Fault-instance count is the ceiling for supervised models.** Roughly 160-190 independent fault
   instances sit behind thousands of correlated windows, so sequence models and classifiers are data
   starved. Isolation Forest does not need fault examples, only normal data. Results should be
   reported with fault-instance-level bootstrap intervals; single-run point estimates swing.
4. **A feature-engineering attempt failed** (round 14: "prior constant hours" for power/weight
   stuck-at faults) and was reverted. Power and weight stuck-at detection stays very low because real
   idle periods look like frozen sensors.
5. **Phase 3 runs end to end** (first run 2026-10-06, local Ollama `qwen2.5:7b`, free). Routing,
   parallel agents and RAG work, and normal windows skip the model. A 7B model's reports are weak: it
   gave a weight in kg when the sensor reports grams (fixed by adding units to the prompt) and
   invented causes. A check that rejects output citing numbers absent from the prompt falls back to a
   template, but it cannot catch wrong units or unsupported inferences. No human has rated any
   report, and Claude was never run.

## Not pursued, and why

- **Phase 4 (drift detection, retraining pipeline).** RQ2 needs real labeled drift events. One station
  is live and the rest are retired, so drift would again be simulated.
- **Phase 5 (Kubernetes, Grafana, 20-case expert study).** The study needs participants and a
  report-writing model good enough to test fairly (RQ3). Neither was available without spending.

## Cheapest next steps if this is picked up again

1. Relabel real outages as a separate class and make clean-subset F1 the headline (see item 2).
2. Have `SensorDriftAgent` report a data outage, not a parameter, when a sensor's readings are missing.
3. Try per-feature autoencoders trained only on normal data (round-14 lead, avoids the instance-count
   ceiling).

## Reproduce

From `phase2_models/` with the Phase 1 venv (`phase1_streaming/venv_phase1`):

    python analyze_missing_data_effect.py     # missing-data split above
    python train_phase2_models.py             # train and evaluate all models

From `phase3_agents/` (Ollama running with `qwen2.5:7b` pulled):

    python run_pipeline.py
