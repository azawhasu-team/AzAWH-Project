# 02 — Ingestion and storage: timestamps, dedup, checkpoints, lifetime totals

No sensor maths happens here; these rules decide **which readings exist and what
time they carry**, which every later calculation depends on.

## 1. Cloud Function `receive_data` (`cloud_functions/receive_data/main.py`)

Pi → HTTPS POST → Firestore `stations/{station_name}/readings/{doc}`.

### Timestamp resolution (`resolve_timestamp`)

```
if payload.replayed is true AND client_timestamp parses:
        ts = client_timestamp (as UTC)
        if now − 30 days ≤ ts ≤ now + 5 min:  use ts            (source = "client")
use SERVER time (Firestore SERVER_TIMESTAMP)                    (source = "server")
```

So **every live reading's timestamp is the moment the cloud received it**, not the
moment the Pi measured it. Network latency (normally < 1 s) shifts timestamps
slightly; during an outage the *replayed* readings keep their true capture time
only if the Pi clock was NTP-synced (01 §8).

### Deduplication

If the payload carries a `reading_id` (8–64 chars `A-Za-z0-9_-`) it becomes the
Firestore **document id** and is created with `create()`; a second POST of the same
id returns `{"status":"duplicate"}` (HTTP 200) and stores nothing. Without
`reading_id` (old stations) a random id is used, so retries could duplicate.

The control fields (`reading_id`, `replayed`, `client_timestamp`) are removed
before storing so they never appear as sensor fields. Every other key in the body
is stored verbatim — including `flow_samples_lmin`, `current`, `flow_hz`,
`flow_total`.

### Auth and limits
`X-Station-Key` shared secret compared with `hmac.compare_digest`
(`STATION_KEYS`, `REQUIRE_STATION_KEY`; soft mode accepts a missing key but logs
it, a wrong key is always 401). Body ≤ 64 KiB. Station names ≤ 200 chars, no `/`,
no control characters, not `.`/`..`/`__x__`.

## 2. Firestore → PostgreSQL worker (`ingestion_worker.py`)

A launchd service on the lab machine. Postgres is used by the **local** backend
and by research code; the **production** backend (Render) has no Postgres and reads
Firestore directly (see CLAUDE.md §7).

| Parameter | Default | Meaning |
|---|---|---|
| `POLL_INTERVAL_SECONDS` | 60 | sleep between polls |
| `BATCH_SIZE` | **4000** | max documents per poll (split across stations) |
| `MAX_RETRIES` | 5 | retry attempts per failing step |
| retry wait | `2**attempt` s → 1, 2, 4, 8, 16 | exponential backoff |

**Fetch rule** (`fetch_new_documents`): for each station query
`timestamp > that station's checkpoint`, ordered ascending, up to
`per_station = max(BATCH_SIZE // n_stations, 50)` documents; merge all, sort by
timestamp, keep the first `BATCH_SIZE`.

**Checkpoint rule:** a JSON file mapping `station → last processed timestamp`
(per station, *not* one global value — a single global checkpoint once jumped past
one station's backlog and silently skipped it). Written atomically (write
`.tmp`, `os.rename`) so a crash mid-write cannot lose the old checkpoint.
After a batch, each station's checkpoint advances to the **maximum timestamp seen
for that station in that batch**; stations with no documents keep their old value.

**Insert rule:** one row per document into `measurements(time, station_id, …)`
with the 17 sensor columns (`temperature … flow_total`); `ON CONFLICT (time,
station_id) DO NOTHING`. Idempotency is therefore twofold: the checkpoint avoids
re-fetching, and the primary key avoids duplicates if the checkpoint is stale.
Missing fields become `NULL`. Fields not in the column list are **not** copied to Postgres.
Since 2026-11-13 the list includes `flow_samples_lmin` (`REAL[]`, the Pi's per-second flow rates); rows
inserted before then were backfilled from Firestore for the testbed from 2026-10-28 with
`scripts/backfill_flow_samples.py`. Older rows, and stations without the list, stay `NULL`.
An existing database needs `ALTER TABLE measurements ADD COLUMN IF NOT EXISTS flow_samples_lmin REAL[];`.

**Station registry:** `station_name → station_id` created on first sight
(`ON CONFLICT (station_name) DO NOTHING`). Location = text after `@` in the
name, trimmed (`"station_AquaPars #2 @Power Station, Tempe"` → `"Power Station,
Tempe"`), else the whole name.

## 3. Lifetime water totals (`compute_lifetime_totals.py`)

Feeds `GET /impact` and the landing page's "Harvested Lifetime". It keeps a running
total per station in `stations/{name}/aggregates/lifetime_totals` so the page does
not stream 100 000+ readings per request.

```
for each new reading (ascending timestamp, resumable by timestamp cursor):
    if reading is inside an excluded window:  last_weight = None; skip
    if last_weight exists and (weight − last_weight) ≥ 25 g:
         total_water_g += weight − last_weight
    last_weight = weight
total_liters = total_water_g / 1000
```

Differences from `/hourly` water (see README "Known inconsistencies" #1):
**flat** 25 g floor (not scaled by the time gap), **no** 1 L/min cap, **no**
expected-production cap. `--recompute` rebuilds from scratch; use it after
changing the exclusion windows. The landing page converts the total to "days of
drinking water" as `round(total_liters / 2)` (2 L/person/day).

`GET /impact` sums the stored per-station values: `total_liters =
round(total_water_g / 1000, 3)` per station and a rounded grand total; results
are cached 300 s.
