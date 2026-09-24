# AzAWH Dashboard

Monitoring dashboard for the Arizona Atmospheric Water Harvesting (AWH) stations
at Arizona State University (SSEBE). It visualizes live and historical data from
9 deployed stations: about 1.58M sensor readings across 14 environmental
parameters, served by the FastAPI backend in [`../backend`](../backend).

**Live:** https://azawhdashboard.vercel.app (login required)

## What it does

- **Station overview** — every station with status and freshness of its last reading
- **Station detail** — live reading (polled every 30s), per-parameter time-series
  charts, hourly water production, specific energy and harvesting efficiency,
  CSV export for any date range
- **Compare** — stations side by side, or one station across months, with
  selectable metric, unit (L / gal) and alignment mode
- **Admin** — station registry management behind a second passphrase gate

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · MUI + Tailwind CSS ·
Recharts · TanStack Query · Vitest

## Architecture

```
Raspberry Pi stations → Firestore → ingestion worker → PostgreSQL
                                                           │
                              FastAPI (Render) ◄───────────┘
                                   │  REST
                                   ▼
                        this dashboard (Vercel)
```

Code layout:

```
src/
  app/            routes (overview, stations/[id], compare, admin, api/*)
  components/     shared UI (Header, StationCard, FeaturePlot, exports…)
  lib/            api client, auth, and pure data logic
    stationChartData.ts   chart series + derived metrics (unit tested)
    stationFields.ts      field metadata, unit conversion, physical constants
  middleware.ts   session gate for every route
```

Data-shaping logic (cumulative water, incremental energy, harvesting
efficiency) lives in pure functions under `src/lib`, separate from React, so it
is covered by unit tests. The tests encode real sensor quirks: noise-floor
filtering on the balance, and dropping corrupt energy-register values instead
of plotting them.

## Getting started

```bash
npm install
cp .env.local.example .env.local   # then fill in values
npm run dev                  # http://localhost:3000
```

### Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL of the FastAPI backend (defaults to `http://localhost:8000`) |
| `DASHBOARD_USER`, `DASHBOARD_PASSWORD` | Site login |
| `SESSION_SECRET` | Signs the site session cookie |
| `ADMIN_PASSPHRASE`, `ADMIN_SESSION_SECRET` | Admin area gate |
| `ADMIN_API_KEY` | Server-side key for admin API routes |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Vitest unit tests |

CI runs lint, typecheck, tests and build on every push and pull request
(see [`.github/workflows/dashboard-ci.yml`](../../.github/workflows/dashboard-ci.yml)).

## Deployment

Vercel deploys from `main` of `azawhasu-team/AzAWH-Project`, path
`awh_az/water-station-dashboard`.
