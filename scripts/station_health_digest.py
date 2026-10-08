#!/usr/bin/env python3
"""Daily station health digest.

Replaces the manual "is every station still reporting sane data?" check.
Detection is plain rules over the local Postgres mirror; an optional local
Ollama model only phrases the already-computed findings as a short digest.
If Ollama is down, or its output cites a number that was not in the findings,
the deterministic template is used instead, so the digest never depends on
the model being right.

    python3 scripts/station_health_digest.py            # rules + Ollama summary
    python3 scripts/station_health_digest.py --no-llm   # rules + template only

A station is only reported when its status *changes* (live -> silent, sensor
newly frozen, ...), tracked in ~/.awh-health-digest/state.json. Most stations
are retired, so listing them daily would just be noise; they appear once as
"known inactive" in the summary line.

Env vars:
    DATABASE_URL     same as ingestion_worker.py
    STALE_HOURS      silence before a live station counts as down (default 6)
    OLLAMA_URL       default http://localhost:11434
    OLLAMA_MODEL     default qwen2.5:7b
    DIGEST_DIR       default ~/.awh-health-digest
"""
import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://mounusha@localhost:5432/awh_db")
STALE_HOURS = float(os.getenv("STALE_HOURS", "6"))
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")
DIGEST_DIR = Path(os.getenv("DIGEST_DIR", os.path.expanduser("~/.awh-health-digest")))

# Real environmental signals: a constant value over a full day means a stuck sensor.
FROZEN_CHECK = ("temperature", "humidity", "outtake_temperature", "outtake_humidity")
# All-null while reporting means a dead sensor.
DEAD_CHECK = ("temperature", "humidity", "weight")
# The DEM730P meter over RS485 exposes only cumulative energy (power/voltage are
# always null by design), so the meter is dead only if all three are missing.
METER_CHECK = ("power", "voltage", "energy")
MIN_ROWS_FOR_SENSOR_CHECK = 30

QUERY = """
SELECT s.station_name,
       max(m.time) AS last_time,
       count(*) FILTER (WHERE m.time >= now() - interval '24 hours') AS rows_24h,
       {aggs}
FROM stations s
LEFT JOIN measurements m ON m.station_id = s.station_id
GROUP BY s.station_name
ORDER BY last_time DESC NULLS LAST
"""


def build_query():
    cols = sorted(set(FROZEN_CHECK) | set(DEAD_CHECK) | set(METER_CHECK))
    aggs = []
    for c in cols:
        aggs.append(f"count({c}) FILTER (WHERE m.time >= now() - interval '24 hours') AS nn_{c}")
        aggs.append(f"count(DISTINCT {c}) FILTER (WHERE m.time >= now() - interval '24 hours') AS d_{c}")
    return QUERY.format(aggs=",\n       ".join(aggs)), cols


def classify(row, now, stale_hours=STALE_HOURS):
    """Return (status, issues) for one station row (a dict).

    status: 'live' | 'silent' | 'never'. 'silent' means the station has data
    but nothing within stale_hours. Sensor issues are only judged on a station
    that is actually reporting.
    """
    last = row["last_time"]
    if last is None:
        return "never", []
    hours = (now - last).total_seconds() / 3600
    if hours > stale_hours:
        return "silent", []
    issues = []
    if row["rows_24h"] >= MIN_ROWS_FOR_SENSOR_CHECK:
        for c in DEAD_CHECK:
            if row[f"nn_{c}"] == 0:
                issues.append(f"{c} sensor dead (no values in 24h)")
        if all(row[f"nn_{c}"] == 0 for c in METER_CHECK):
            issues.append("power meter dead (no power, voltage or energy in 24h)")
        for c in FROZEN_CHECK:
            if row[f"nn_{c}"] > 0 and row[f"d_{c}"] == 1:
                issues.append(f"{c} sensor frozen (one repeated value in 24h)")
    return "live", issues


def diff_state(prev, current):
    """Compare {station: {'status','issues'}} snapshots; return a list of finding dicts."""
    findings = []
    for name, cur in current.items():
        old = prev.get(name)
        if old is None:
            if cur["status"] == "live":
                findings.append({"station": name, "type": "new_live", "detail": "now reporting"})
            continue
        if old["status"] == "live" and cur["status"] == "silent":
            findings.append({"station": name, "type": "went_silent",
                             "detail": f"no data for {cur['hours_silent']:.1f} h"})
        elif old["status"] != "live" and cur["status"] == "live":
            findings.append({"station": name, "type": "recovered", "detail": "reporting again"})
        if cur["status"] == "live":
            for issue in sorted(set(cur["issues"]) - set(old.get("issues", []))):
                findings.append({"station": name, "type": "sensor", "detail": issue})
            for issue in sorted(set(old.get("issues", [])) - set(cur["issues"])):
                findings.append({"station": name, "type": "sensor_cleared", "detail": issue + " - cleared"})
    went_silent = [f for f in findings if f["type"] == "went_silent"]
    live_before = [n for n, s in prev.items() if s["status"] == "live"]
    if len(live_before) >= 2 and len(went_silent) == len(live_before):
        findings.append({"station": "ALL", "type": "global",
                         "detail": "every previously live station went silent at once; "
                                   "suspect the ingestion worker or database, not the stations "
                                   "(run check_ingestion_sync.py)"})
    return findings


def template_digest(findings, counts, day):
    lines = [f"AWH station health - {day}",
             f"{counts['live']} live, {counts['silent']} known inactive, {counts['never']} never reported."]
    if not findings:
        lines.append("No changes since the last check.")
    for f in findings:
        lines.append(f"- {f['station']}: {f['detail']}")
    return "\n".join(lines)


NUM_RE = re.compile(r"\d+(?:\.\d+)?")


def numbers_in(text):
    """Numbers as normalised floats, so 04 == 4 and 36.60 == 36.6."""
    return {str(float(n)) for n in NUM_RE.findall(text)}


def ollama_generate(prompt, model=OLLAMA_MODEL, url=OLLAMA_URL, timeout=120):
    """One non-streaming Ollama call at temperature 0. Returns text, or None if unreachable."""
    body = json.dumps({"model": model, "prompt": prompt, "stream": False,
                       "options": {"temperature": 0}}).encode()
    req = urllib.request.Request(f"{url}/api/generate", data=body,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.load(resp).get("response", "").strip() or None
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        return None


def llm_digest(findings, counts, day, **kw):
    """Ask the local model to phrase the findings. Returns text, or None if unusable."""
    facts = template_digest(findings, counts, day)
    prompt = (
        "You are writing a short status note for engineers running atmospheric water "
        "harvesting stations. Rewrite the facts below as at most 5 plain lines. "
        "Use only the facts and numbers given; do not add causes, advice, or new numbers.\n\n"
        f"FACTS:\n{facts}\n"
    )
    text = ollama_generate(prompt, **kw)
    if not text or not numbers_in(text) <= numbers_in(facts):
        return None  # empty, or it invented a number: fall back to the template
    return text


def fetch_rows():
    import psycopg2
    import psycopg2.extras
    sql, _ = build_query()
    with psycopg2.connect(DATABASE_URL) as conn, conn.cursor(
            cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql)
        return [dict(r) for r in cur.fetchall()]


def load_state(path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return {}


def save_state(path, state):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2))
    os.rename(tmp, path)  # atomic, same pattern as the ingestion checkpoint


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--no-llm", action="store_true", help="skip Ollama, use the template")
    args = ap.parse_args(argv)

    now = datetime.now(timezone.utc)
    day = now.astimezone().strftime("%Y-%m-%d")
    rows = fetch_rows()

    current = {}
    for row in rows:
        status, issues = classify(row, now)
        hours = None if row["last_time"] is None else (now - row["last_time"]).total_seconds() / 3600
        current[row["station_name"]] = {"status": status, "issues": issues, "hours_silent": hours}

    state_path = DIGEST_DIR / "state.json"
    first_run = not state_path.exists()
    if first_run:  # no history to diff against: report whatever is wrong right now
        findings = [{"station": n, "type": "sensor", "detail": i}
                    for n, s in current.items() if s["status"] == "live" for i in s["issues"]]
    else:
        findings = diff_state(load_state(state_path), current)
    counts = {k: sum(1 for s in current.values() if s["status"] == k) for k in ("live", "silent", "never")}

    text = None if args.no_llm else llm_digest(findings, counts, day)
    source = "ollama" if text else "template"
    text = text or template_digest(findings, counts, day)
    if first_run:
        text += "\n(first run: baseline recorded, changes will be reported from the next run)"

    DIGEST_DIR.mkdir(parents=True, exist_ok=True)
    (DIGEST_DIR / f"{day}.md").write_text(text + f"\n\n_source: {source}_\n")
    save_state(state_path, current)
    print(text)
    return 1 if any(f["type"] in ("went_silent", "global") for f in findings) else 0


if __name__ == "__main__":
    sys.exit(main())
