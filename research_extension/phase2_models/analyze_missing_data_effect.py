"""
AWH Phase 2 - how much do windows with PRE-EXISTING missing data (real sensor
outages, stations without a given sensor) drive the benchmark metrics?

The benchmark labels come only from injected synthetic faults. A real outage
(e.g. station 5's temperature/humidity gap, Apr 29 - May 5 2026) or a sensor a
station never had (station 9: no power meter) is labeled "normal", yet the
detectors flag it because their features include missing_frac. This script
splits the test set into:
  clean      - no feature >= 50% missing, except the injected fault's own feature
  pre-existing missing - at least one other feature >= 50% missing
and reports detection F1 / attribution F1 per model on each subset.

Usage (from this directory, Phase 1 venv):
    python analyze_missing_data_effect.py
"""

from __future__ import annotations

import joblib
import pandas as pd

from build_benchmark_dataset import FEATURE_COLUMNS
from evaluate import attribution_f1, detection_f1

MISSING_THRESHOLD = 0.5
MODELS = {"rule_baseline": "rule_baseline", "isolation_forest": "isolation_forest_ensemble",
          "lstm": "lstm_attribution_model"}


def mark_clean(df: pd.DataFrame) -> pd.Series:
    miss = pd.DataFrame({f: df[f"{f}_missing_frac"] >= MISSING_THRESHOLD for f in FEATURE_COLUMNS})
    cause = df["causal_parameter"]
    other_missing = miss.apply(lambda col: col & (cause != col.name))
    return ~other_missing.any(axis=1)


def main():
    df = pd.read_parquet("data/test.parquet")
    df["clean"] = mark_clean(df)
    print(f"test windows {len(df)}: clean {int(df.clean.sum())}, pre-existing missing {int((~df.clean).sum())}")
    print(f"anomalous clean/dirty: {int((df.is_anomaly & df.clean).sum())}/{int((df.is_anomaly & ~df.clean).sum())}; "
          f"normal clean/dirty: {int((~df.is_anomaly & df.clean).sum())}/{int((~df.is_anomaly & ~df.clean).sum())}")
    print(f"\n{'model':<17}{'subset':<24}{'det F1':>8}{'attrib F1':>11}")
    for name, fname in MODELS.items():
        preds = joblib.load(f"data/models/{fname}.joblib").predict(df)
        for label, mask in [("full test", df.index == df.index), ("clean only", df.clean),
                            ("pre-existing missing", ~df.clean)]:
            sub = df[mask]
            p = preds.loc[sub.index]
            print(f"{name:<17}{label:<24}{detection_f1(sub, p):>8.3f}{attribution_f1(sub, p):>11.3f}")


if __name__ == "__main__":
    main()
