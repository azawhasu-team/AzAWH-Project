# Security model

## Layers

| Layer | Protects | Secret(s) |
|---|---|---|
| Site login (`src/proxy.ts`, `lib/auth.ts`) | every dashboard page and `/api/*` | `DASHBOARD_USER`, `DASHBOARD_PASSWORD`, `SESSION_SECRET` |
| Admin passphrase (second gate) | `/admin/*` pages and `/api/admin/*` | `ADMIN_PASSPHRASE`, `ADMIN_SESSION_SECRET` |
| Backend read key | every backend data endpoint | `API_KEY` (backend) = `BACKEND_API_KEY` (dashboard) |
| Backend admin key | `/admin/*`, `POST /stations-registry`, `/cache/*` | `ADMIN_API_KEY` (backend) = `ADMIN_API_KEY` (dashboard) |

The browser never talks to the backend. It calls the dashboard's own
`/api/backend/*` (`src/lib/backendProxy.ts`), which checks the site session,
allows only `stations`, `impact`, `export`, `stations-registry` (GET) and
`POST export`, and attaches `X-API-Key` server-side. Neither key is ever sent to
the browser, and the browser's cookie is never forwarded to the backend.
`/health` and `/` stay public for uptime probes.

## Turning the private API on (order matters)

The backend is **open while `API_KEY` is unset** (so deploys can't lock anyone
out), and logs a warning at startup. `GET /health` shows
`services.api_auth` = `open` or `enforced`.

1. Generate a key: `openssl rand -hex 32`.
2. Vercel: set `BACKEND_API_KEY` (same value) and `BACKEND_URL` (the Render URL); redeploy.
3. Render: set `API_KEY` (same value); it redeploys. Docs and `openapi.json` switch off.
4. Check: anonymous `GET <render-url>/stations` must be `401`, and the dashboard must still load data.
5. GitHub Actions: add a repository secret named `AWH_API_KEY` (same value). The
   `Monitor` workflow's 6-hourly freshness check calls `/stations`, which needs it;
   without the secret that job starts failing (and emailing) once the key is enforced.
   The 10-minute uptime check only uses `/health`, which stays public.
6. Scripts you run by hand that read the API (`scripts/check_backend.py --mode freshness`,
   `export_anomalies.py --source api`, `ml/forecast_train.py`) need `AWH_API_KEY` in
   your shell. The launchd jobs (ingestion, health digest, sync check) read Postgres and
   Firestore directly, so they are unaffected.

Rotate by repeating 1-3; there is a brief window where the two differ, so do it
at a quiet time.

## Login throttling

`lib/loginGuard.ts` counts each attempt *before* the credentials are checked (an
atomic increment, so parallel guesses can't slip past) and clears the client's
counter on success. Clients are identified by `x-real-ip`/`x-forwarded-for`, which
Vercel sets itself. The two logins have separate budgets. The admin login is also
behind the site login, so it can only be guessed at by someone already signed in.

## Known gaps

- Login throttling is only as strong as its store. The site login and the admin
  passphrase each allow 5 attempts per client per 15 minutes (then 429 +
  `Retry-After`), with a 200-attempts/hour circuit breaker across all clients. Without
  Redis the counters live in each serverless instance's memory and reset on cold
  start, so a determined attacker can get more guesses than that. For a hard limit set
  `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` on Vercel (a free Upstash
  database is enough); the limiter then counts in Redis shared by every instance.
- One shared credential: no per-user audit trail, and individual sessions can't
  be revoked (rotate `SESSION_SECRET` to sign everyone out).
- The CSP allows inline scripts/styles (Next's bootstrap, the colour-mode init
  script and MUI need them); a nonce-based policy is a larger change.
- The Pi's `receive_data` cloud function (readings upload) has no authentication.
