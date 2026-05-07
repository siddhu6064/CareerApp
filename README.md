# [AppName]

AI-powered job search platform — web, mobile, and desktop. Upload your resume once, get a daily digest of ranked jobs, tailor your resume to any role in one click, track applications through every stage, and prep for interviews — all with Claude AI.

**Build state:** 205/252 tasks (81.3%) · Phases 1–7, 8, 9, 10 (code) complete

---

## Stack

| Layer | Technology |
|---|---|
| Web | Next.js 15.5 (App Router) · Tailwind CSS v4 · Zustand · Vercel |
| Mobile | Expo SDK 52 · React Native 0.76 · Expo Router 4 · iOS + Android |
| Backend | FastAPI (Python 3.12) · Render (Docker) |
| Database | Supabase (PostgreSQL + Auth + Realtime) in SaaS · SQLite in desktop/dev |
| Storage | Cloudflare R2 (resume PDFs) in SaaS · LocalFileStorage in desktop |
| AI | Claude Haiku 4.5 (tagging, digest pre-scoring) · Claude Sonnet 4.6 (tailoring, cover letters, interview prep, parsing) |
| Jobs | JSearch (RapidAPI) primary · Adzuna fallback · Greenhouse/Lever/Ashby/Workable (desktop) |
| Email | Resend (daily digest + transactional) |
| Billing | LemonSqueezy (Pro $19/mo · Coach $49/mo · monthly + annual) |
| Push | Expo Push Notification Service |
| Desktop | Tauri 2 shell · PyInstaller sidecar · SQLite · APScheduler |

---

## Phase status

| Phase | Status | What's built |
|---|---|---|
| 1 — Foundation | ✅ code done | StorageAdapter, SqliteAdapter, SupabaseAdapter (~980 lines), docker-compose, Supabase schema + RLS, auth |
| 2 — Job Feed | ✅ code done | JSearch + Adzuna fetchers, Haiku tagger, quality gate, dedup, TTL cache |
| 3 — Resume + Tracker | ✅ code done | PDF/DOCX/TXT parse, 8-stage tracker, recruiter contacts, interviews, salary, Supabase JWT |
| 4a — Web UI | ✅ done | 19 pages, drag-drop kanban, onboarding, grade badges, diff view, PDF preview, upgrade modal |
| 4b — Mobile | ✅ done | 5 tabs, swipe kanban, MMKV offline, sync queue, recruiter screen, deep links, push tap |
| 5 — AI Tailor + PDF | ✅ done | Sonnet structured output, WeasyPrint, ATS scoring, Free 3 / Pro 100 / Desktop ∞ |
| 6 — Notifications | ✅ code done | ATS pre-scored digest, one-click unsubscribe, Resend webhooks, Expo push reminders |
| 7 — Billing | ✅ code done | LemonSqueezy checkout + portal + webhook lifecycle, pricing page, upgrade sheet, plan badge |
| 8 — Pro Features | ✅ done | Cover letters, interview prep (offline mobile), analytics dashboard |
| 9 — Coach Tier | ✅ done | 14 endpoints, 10 client profiles, bulk tailor, white-label PDF |
| 10 — Desktop | ✅ code done | Tauri 2, BYOK key management, 4 ATS source adapters, APScheduler, auto-updater, release workflow |

**186 backend tests passing · web `tsc --noEmit` clean · mobile `tsc --noEmit` clean**

---

## Tier gates

| Feature | Free | Pro ($19/mo) | Coach ($49/mo) | Desktop |
|---|---|---|---|---|
| Active tracked applications | 10 | Unlimited | Unlimited + 10 clients | Unlimited |
| AI tailors / month | 3 | 100 | 100 | ∞ (BYOK) |
| Digest ATS match % | Hidden | ✅ | ✅ | ✅ |
| Cover letters | — | ✅ | ✅ | ✅ |
| Interview prep | — | ✅ | ✅ | ✅ |
| Analytics dashboard | — | ✅ | ✅ | ✅ |
| Bulk tailor for clients | — | — | ✅ | — |
| White-label PDF | — | — | ✅ | — |

All gates enforced server-side. Tests in `test_applications.py`, `test_tailor.py`, `test_phase7.py`.

---

## Quick start — local dev (no signups needed)

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt

APPNAME_MODE=desktop \
STUB_JOBS_API=1 STUB_ANTHROPIC=1 STUB_RESEND=1 STUB_EXPO_PUSH=1 STUB_LEMONSQUEEZY=1 \
  uvicorn backend.main:app --reload
```

Server prints a per-launch bearer token:
```
[AppName] mode=desktop  api_token=a1b2c3...
```
Copy it — both web and mobile use it for auth in dev mode.

### Run tests

```bash
cd backend
APPNAME_MODE=desktop STUB_JOBS_API=1 STUB_ANTHROPIC=1 STUB_RESEND=1 \
STUB_EXPO_PUSH=1 STUB_LEMONSQUEEZY=1 APPNAME_DISABLE_SCHEDULER=1 \
  pytest -q
# → 186 passed
```

### Web

```bash
cd web
npm install --legacy-peer-deps
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000 npm run dev
# → http://localhost:3000
```

Paste the backend token on `/signin`. Visit `/jobs` → "Ingest sample jobs" to populate feed.

### Mobile

```bash
cd mobile
npm install --legacy-peer-deps
npx expo start
```

### Docker (SaaS mode)

```bash
cp backend/.env.example backend/.env   # fill in SUPABASE_* vars
docker compose up --build
# Backend at http://localhost:8000
```

---

## Environment variables

All env vars are documented in `backend/.env.example`. Summary:

| Service | Variables | Where to get |
|---|---|---|
| Supabase | `SUPABASE_URL` `SUPABASE_SERVICE_KEY` `SUPABASE_JWT_SECRET` | supabase.com → Project Settings → API |
| Anthropic | `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys · set $50/mo hard cap |
| LemonSqueezy | `LEMONSQUEEZY_API_KEY` `LEMONSQUEEZY_STORE_ID` `LEMONSQUEEZY_WEBHOOK_SECRET` + 4 variant IDs | app.lemonsqueezy.com → Settings → API |
| Resend | `RESEND_API_KEY` `RESEND_FROM` `RESEND_WEBHOOK_SECRET` | resend.com → API Keys + Domains |
| Cloudflare R2 | `R2_ENDPOINT` `R2_BUCKET` `R2_ACCESS_KEY_ID` `R2_SECRET_ACCESS_KEY` | dash.cloudflare.com → R2 |
| JSearch | `JSEARCH_API_KEY` | rapidapi.com → JSearch |
| Adzuna | `ADZUNA_APP_ID` `ADZUNA_API_KEY` | developer.adzuna.com |
| Internal | `X_INTERNAL_SECRET` | `openssl rand -hex 32` — add to GitHub secrets too |
| URL | `WEB_BASE_URL` | `https://app.appname.io` in production |

---

## Production deploy

### Supabase

Run `supabase/schema.sql` in the SQL Editor — creates all tables, RLS policies, Realtime publication, and the `handle_new_user()` trigger.

### Backend → Render

1. Connect repo to Render — auto-detects `backend/render.yaml`
2. Add all env vars from `backend/.env.example` in the dashboard
3. Render auto-generates `INTERNAL_SECRET` — copy to GitHub repo secrets

### Web → Vercel

```bash
cd web && vercel --prod
```

Add `NEXT_PUBLIC_API_URL` + Supabase + LemonSqueezy variant ID env vars in Vercel dashboard.

### GitHub Actions cron

Requires GitHub repo secrets: `API_URL` + `INTERNAL_SECRET`

| Workflow | Schedule | Purpose |
|---|---|---|
| `cron-jobs-fetch.yml` | 06:00 UTC | Fetch + tag jobs from JSearch/Adzuna |
| `cron-digest.yml` | 06:15 UTC | ATS pre-score + send digest emails |
| `cron-push.yml` | 06:30 UTC | Interview/follow-up/stale push notifications |

All have `workflow_dispatch` for manual testing.

---

## Repo structure

```
CareerApp/
├── backend/
│   ├── main.py                    # 74 endpoints
│   ├── config.py                  # mode-aware env wiring
│   ├── billing/lemonsqueezy.py    # checkout, portal, webhook verify
│   ├── storage/                   # StorageAdapter + SqliteAdapter + SupabaseAdapter
│   ├── auth/                      # local_token (desktop) + supabase_jwt (SaaS)
│   ├── jobs/                      # JSearch/Adzuna fetchers, Haiku tagger, pipeline
│   ├── resumes/                   # Sonnet parser, file storage adapter
│   ├── tailor/                    # AI tailor: scorer + Sonnet + WeasyPrint
│   ├── ai/                        # cover_letter.py, interview_prep.py
│   ├── analytics/                 # funnel, ATS correlation, digest metrics
│   ├── coach/                     # bulk tailor, branding injection
│   ├── notifications/             # Resend email + Expo push
│   ├── agents/justhireme/         # MIT-licensed ATS scoring engine
│   ├── agents/sources/            # Greenhouse/Lever/Ashby/Workable (desktop)
│   ├── tests/                     # 186 tests, 12 test files
│   ├── Dockerfile                 # multi-stage, WeasyPrint native libs
│   ├── render.yaml                # Render Blueprint
│   └── .env.example               # all env vars documented
├── web/
│   ├── app/                       # 19 pages
│   ├── components/                # 17 components
│   └── lib/                       # api.ts, store.ts, realtime.ts
├── mobile/
│   ├── app/                       # 13 screens
│   ├── components/                # SwipeableApplicationCard, UpgradeSheet ...
│   └── lib/                       # api.ts, mmkv.ts, sync.ts, notifications.ts
├── supabase/schema.sql            # PostgreSQL + RLS + Realtime + trigger
├── desktop/
│   ├── src-tauri/                 # Tauri 2 config + Rust sidecar
│   ├── site/                      # desktop.appname.io static site (Vercel)
│   └── README.md                  # desktop build + signing guide
├── docs/DESKTOP_VALIDATION.md    # multi-OS validation checklist
├── .github/workflows/             # 3 cron jobs + desktop release matrix
├── docker-compose.yml
├── CHANGELOG.md
├── ROADMAP.md
└── LICENSE-justhireme
```

---

## Pending — user actions to go live

### SaaS (in order)

1. Supabase — create project, run `supabase/schema.sql`, enable Auth + Realtime
2. Cloudflare R2 — create bucket, generate API token
3. Anthropic — API key, set $50/mo hard spend limit
4. Resend — verify domain (SPF/DKIM/DMARC), API key
5. JSearch — subscribe on RapidAPI
6. Adzuna — create developer app
7. LemonSqueezy — store, Pro product (monthly $19 + annual $190, 7-day trial), Coach product (monthly $49 + annual $490), register webhook URL, copy all env vars
8. Render — deploy, set env vars, copy `INTERNAL_SECRET` to GitHub secrets
9. Vercel — deploy web, set env vars
10. GitHub secrets — `API_URL` + `INTERNAL_SECRET`

### Mobile (after SaaS live)

11. Apple Developer account ($99/yr)
12. Google Play Console ($25)
13. `eas build --platform all --profile production`
14. `eas submit --platform ios` + `eas submit --platform android`

### Desktop v0.1.0 (after SaaS validated)

15. Apple Developer / Windows EV cert (~$300/yr)
16. Generate ed25519 updater keypair: `cargo tauri signer generate`
17. Add public key to `desktop/src-tauri/tauri.conf.json`
18. Set `TAURI_SIGNING_PRIVATE_KEY` in GitHub Actions secrets
19. Deploy `desktop/site/` to Vercel as `desktop.appname.io`
20. Validate on macOS 14+, Windows 11, Ubuntu 22.04
21. Tag `v0.1.0` — triggers release matrix build

---

## Attribution

`backend/agents/justhireme/` is adapted from [vasu-devs/justhireme](https://github.com/vasu-devs/justhireme), MIT-licensed. License at `LICENSE-justhireme`. Per-file attribution headers preserved.
