# [AppName] — Phases 1–6 + 8 + 9 + 10 (code/config)

Multi-tenant SaaS job-search platform with web + mobile clients, Render-ready
backend, daily digest email, push notifications, and GitHub Actions cron.

Desktop variant uses the same backend in local mode (BYOK Anthropic key,
SQLite, local files). The same FastAPI app powers both — `APPNAME_MODE`
selects storage and auth strategy.

## Status

| Phase | Status | Notes |
|------:|:-------|:------|
| 1 — Foundation                  | ✅ done | StorageAdapter pattern, mode-aware config, local-token auth |
| 2 — Jobs feed                   | ✅ done | JSearch + Adzuna stubs (SaaS), Greenhouse/Lever/Ashby/Workable (desktop) |
| 3 — Resume + Tracker            | ✅ done | Master resume parser, 8-stage tracker, sub-resources |
| 4a — Web UI                     | ✅ done | Next.js 15, 16 routes, kanban, settings panel + BYOK card |
| 4b — Mobile                     | ✅ done | Expo SDK 52, 5 tabs, push registration |
| 5 — AI Tailor + PDF             | ✅ done | Sonnet structured output, WeasyPrint, Free 3 / Pro 100 / Coach 100 / Desktop ∞ |
| 6 — Daily digest + push         | ✅ done | Resend digest, Expo push, GH Actions cron |
| 7 — Billing                     | ⏳ next  | LemonSqueezy webhooks |
| 8 — Pro features                | ✅ done | Cover letters, interview prep, analytics |
| 9 — Coach features              | ✅ done | 14 endpoints, multi-client, bulk tailor, white-label PDF |
| 10 — Desktop variant            | ✅ code/config | BYOK + 4 ATS adapters + Tauri 2 shell + APScheduler + auto-updater + signing config + GH Actions release workflow. **Paid certs ($99 Apple + $300 Windows EV) and multi-OS validation are user actions — see `docs/DESKTOP_VALIDATION.md`.** |

## Test status

- **162 backend tests passing** in BOTH `APPNAME_MODE=desktop` AND `APPNAME_MODE=saas` (no regressions)
- Web typecheck + production build clean (Next 15.5.16)
- Mobile TypeScript clean (Expo SDK 52)
- 70 backend endpoints (was 57 — +13 Phase 10: BYOK, validate-keys, manual fetch)

## Phase 10 user-action checklist

Code is shipped. Before tagging `v0.1.0`:

1. Apple Developer Program enrollment ($99/yr)
2. Windows EV code signing cert (~$300/yr)
3. Generate ed25519 updater keypair: `cargo tauri signer generate -w ~/.tauri/appname.key`
4. Replace `REPLACE_WITH_TAURI_UPDATER_PUBKEY` in `desktop/src-tauri/tauri.conf.json`
5. Set GitHub repo secrets (see top of `.github/workflows/desktop-release.yml`)
6. Build real `icon.icns` + `icon.ico` (see `desktop/src-tauri/icons/README.md`)
7. Run multi-OS validation in `docs/DESKTOP_VALIDATION.md`
8. Stand up `desktop.appname.io` for the update manifest (Vercel)

## Repo layout

```
appname/
├── backend/                       # FastAPI + SQLite (desktop) / Supabase (SaaS)
│   ├── main.py                    # 39 endpoints
│   ├── config.py                  # APPNAME_MODE detection + env wiring
│   ├── storage/                   # StorageAdapter abstract base + impls
│   ├── auth/                      # local_token (desktop) + supabase_jwt stub
│   ├── jobs/                      # JSearch/Adzuna fetchers, tagger, pipeline, cache
│   ├── resumes/                   # Sonnet parser + file storage adapter
│   ├── tailor/                    # AI tailor: scorer + sonnet + WeasyPrint render
│   ├── notifications/             # Resend email + Expo push (Phase 6)
│   ├── agents/justhireme/         # MIT-licensed scoring engine port
│   ├── tests/                     # pytest-asyncio, 88 tests
│   ├── Dockerfile                 # multi-stage, all WeasyPrint native libs
│   ├── render.yaml                # Render Blueprint, 13 env vars
│   ├── DEPLOY.md                  # ops doc
│   └── requirements.txt           # pinned versions
├── web/                           # Next.js 15 (App Router) + Tailwind v4 + Zustand
│   ├── app/                       # /, /signin, /jobs, /jobs/[id], /tracker,
│   │                              # /applications/[id], /resume, /tailored, /settings
│   ├── components/                # JobCard, JobFilters, TailorPanel, StatusBadge, Nav
│   └── lib/                       # api.ts (typed client), store.ts (Zustand), types.ts
├── mobile/                        # Expo SDK 52 + Expo Router 4 + Zustand
│   ├── app/                       # (tabs), signin, jobs/[id], applications/[id]
│   ├── components/                # JobCard, ApplicationCard, TailorPanel, ScoreCircle
│   └── lib/                       # api.ts, auth.ts (SecureStore), notifications.ts
├── .github/workflows/             # 3 cron jobs (Phase 6)
│   ├── cron-jobs-fetch.yml        # 06:00 UTC daily
│   ├── cron-digest.yml            # 06:15 UTC daily
│   └── cron-push.yml              # 06:30 UTC daily
└── LICENSE-justhireme             # MIT credit for ported scoring engine
```

## Quick start (desktop dev mode — no signups, no API keys)

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt

APPNAME_MODE=desktop \
STUB_JOBS_API=1 STUB_ANTHROPIC=1 STUB_RESEND=1 STUB_EXPO_PUSH=1 \
  uvicorn backend.main:app --reload
```

The server prints a per-launch bearer token like:

```
[AppName] mode=desktop  api_token=<hex>
```

Copy that — both clients need it for auth.

### Web

```bash
cd web
npm install --legacy-peer-deps
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000 npm run dev
```

Open `http://localhost:3000`, paste the token on `/signin`, then visit `/jobs`
and click "Ingest sample jobs" to populate the feed.

### Mobile (Expo)

```bash
cd mobile
npm install --legacy-peer-deps
npx expo start
```

Edit `app.json`'s `extra.apiUrl` if you need the device to hit a non-localhost
backend URL (e.g. your laptop's LAN IP for a real phone).

## Production deploy

### Backend → Render

1. Connect this repo to Render.
2. Render auto-detects `backend/render.yaml` (Blueprint).
3. Set the secrets in the dashboard (all marked `sync: false`):
   `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
   `SUPABASE_JWT_SECRET`, `R2_BUCKET`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_ENDPOINT`,
   `JSEARCH_API_KEY`, `ADZUNA_APP_ID`/`ADZUNA_APP_KEY`, `RESEND_API_KEY`.
4. Render auto-generates `INTERNAL_SECRET`. Copy that into GitHub Actions
   secrets as `INTERNAL_SECRET` + add `API_URL=https://your-render-url`.

### GitHub Actions cron

The three workflows in `.github/workflows/` need two repository secrets:

- `API_URL` — your Render service URL
- `INTERNAL_SECRET` — must match Render's value

Schedules:
- `cron-jobs-fetch.yml` — 06:00 UTC daily (job ingestion)
- `cron-digest.yml` — 06:15 UTC daily (digest email, hour=6 bucket)
- `cron-push.yml` — 06:30 UTC daily (interview/follow-up/stale push)

Each workflow has `workflow_dispatch` so you can trigger them manually for testing.

## Tier gates (PRD §11)

| Tier        | Tracker      | Tailors/mo | Digest ATS % | Cover letters | Interview prep | Analytics |
|-------------|--------------|-----------:|:-------------|:--------------|:---------------|:----------|
| Free        | 10 active    | 3          | hidden       | —             | —              | —         |
| Pro ($19)   | unlimited    | 100        | shown        | ✓             | ✓              | ✓         |
| Coach ($49) | unlimited + 10 clients | 100 | shown    | ✓             | ✓              | ✓ + bulk + white-label |
| Desktop     | unlimited    | unlimited (BYOK) | always shown | ✓        | ✓              | ✓         |

Gates are enforced server-side. The Free tracker limit (10 active) and Free
tailor limit (3/mo) have explicit tests in `test_applications.py` and
`test_tailor.py`.

## Attribution

The deterministic ATS scoring engine in `backend/agents/justhireme/` is
adapted from [vasu-devs/justhireme](https://github.com/vasu-devs/justhireme),
MIT-licensed. Each ported file carries an attribution header; the project
LICENSE lives at `LICENSE-justhireme` at the repo root.
