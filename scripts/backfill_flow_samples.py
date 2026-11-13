#!/usr/bin/env python3
"""Backfill measurements.flow_samples_lmin (REAL[]) from Firestore.

The ingestion worker stores the per-second flow list for NEW rows, but rows it
inserted before the column existed have NULL (and ON CONFLICT DO NOTHING never
revisits them). This copies the list from Firestore onto those rows.

Usage (dry run by default):
    python scripts/backfill_flow_samples.py --station "station_testbed_1@Powerplant" \
        --since 2026-10-28            # counts only
    python scripts/backfill_flow_samples.py --station ... --since 2026-10-28 --apply

Only rows where flow_samples_lmin IS NULL are updated, so it is safe to re-run.
Needs DATABASE_URL and FIREBASE_CREDENTIALS_PATH (same as the ingestion worker).
Firestore bills one read per document scanned.
"""
import argparse
import os
import sys
from datetime import datetime, timezone

import psycopg2
from psycopg2.extras import execute_values

BATCH = 2000


def clean(v):
    if not isinstance(v, (list, tuple)):
        return None
    out = [float(x) for x in v if isinstance(x, (int, float)) and not isinstance(x, bool)]
    return out or None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--station", required=True)
    ap.add_argument("--since", required=True, help="UTC date, e.g. 2026-10-28")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    import firebase_admin
    from firebase_admin import credentials, firestore

    cred_path = os.getenv("FIREBASE_CREDENTIALS_PATH")
    if not cred_path:
        sys.exit("FIREBASE_CREDENTIALS_PATH is not set")
    firebase_admin.initialize_app(credentials.Certificate(cred_path))
    fs = firestore.client()
    conn = psycopg2.connect(os.getenv("DATABASE_URL", "postgresql://mounusha@localhost:5432/awh_db"))
    cur = conn.cursor()
    cur.execute("SELECT station_id FROM stations WHERE station_name = %s", (args.station,))
    row = cur.fetchone()
    if not row:
        sys.exit(f"station {args.station!r} not in Postgres")
    station_id = row[0]

    since = datetime.fromisoformat(args.since).replace(tzinfo=timezone.utc)
    q = (
        fs.collection("stations").document(args.station).collection("readings")
        .where("timestamp", ">=", since).order_by("timestamp")
        .select(["timestamp", "flow_samples_lmin"])
    )
    scanned = with_list = updated = 0
    batch = []

    def flush():
        nonlocal updated, batch
        if not batch:
            return
        if args.apply:
            execute_values(
                cur,
                """UPDATE measurements m SET flow_samples_lmin = v.s::real[]
                   FROM (VALUES %s) AS v(t, sid, s)
                   WHERE m.time = v.t::timestamptz AND m.station_id = v.sid AND m.flow_samples_lmin IS NULL""",
                batch, template="(%s, %s, %s)",
            )
            updated += cur.rowcount
            conn.commit()
        batch = []

    for doc in q.stream():
        scanned += 1
        d = doc.to_dict()
        s = clean(d.get("flow_samples_lmin"))
        if s is None:
            continue
        with_list += 1
        batch.append((d["timestamp"].isoformat(), station_id, s))
        if len(batch) >= BATCH:
            flush()
            print(f"scanned {scanned}, with list {with_list}, rows updated {updated}", flush=True)
    flush()
    print(f"done: scanned {scanned}, with list {with_list}, rows updated {updated}"
          + ("" if args.apply else "  (dry run, nothing written)"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
