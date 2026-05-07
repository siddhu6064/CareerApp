# [AppName] Backend

FastAPI backend. Mode-aware via `APPNAME_MODE` env var:

- **`saas`** — multi-tenant cloud, Supabase + R2 + all external services
- **`desktop`** — single-user local, SQLite + local files, no signups needed

**186 tests passing · 74 endpoints · Python 3.12**

---

## Run locally (desktop mode — no signups)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt

APPNAME_MODE=desktop \
STUB_JOBS_API=1 STUB_ANTHROPIC=1 STUB_RESEND=1 STUB_EXPO_PUSH=1 STUB_LEMONSQUEEZY=1 \
  uvicorn backend.main:app --reload
```

Server prints a per-launch bearer token — copy it for web/mobile auth.

```bash
curl http://127.0.0.1:8000/health
curl -H "Authorization: Bearer <token>" http://127.0.0.1:8000/api/me
```

Data lives at `~/.appname/data.db` (override with `APPNAME_DATA_DIR`).

## Run tests

```bash
APPNAME_MODE=desktop STUB_JOBS_API=1 STUB_ANTHROPIC=1 STUB_RESEND=1 \
STUB_EXPO_PUSH=1 STUB_LEMONSQUEEZY=1 APPNAME_DISABLE_SCHEDULER=1 \
  pytest -q
# → 186 passed
```

## Environment variables

See `.env.example` for the full reference. All values are empty by default — fill them in for SaaS mode.

## Architecture

### StorageAdapter pattern

Every endpoint reads/writes through `StorageAdapter`. Mode is transparent to endpoint code:

```
storage/
├── base.py             # 71 abstract methods
├── sqlite_adapter.py   # SQLite impl — desktop + all tests
├── supabase_adapter.py # Supabase impl — SaaS (~980 lines)
└── sqlite_schema.sql   # SQLite DDL
```

### Auth

```
auth/
├── local_token.py     # desktop bearer token (per-launch)
└── supabase_jwt.py    # SaaS HS256 JWT verify via PyJWT
```

### Key modules

| Module | Purpose |
|---|---|
| `billing/lemonsqueezy.py` | Checkout URL, portal URL, HMAC webhook verify |
| `jobs/` | JSearch + Adzuna fetchers, Haiku tagger, quality gate, dedup |
| `resumes/` | Sonnet PDF/DOCX/TXT parser, file storage adapter |
| `tailor/` | Sonnet structured tailoring, ATS scorer, WeasyPrint PDF |
| `ai/` | Cover letter generation, interview prep |
| `analytics/` | Funnel, ATS correlation, digest engagement |
| `coach/` | Bulk tailor, white-label branding injection |
| `notifications/` | Resend email renderer, Expo push sender |
| `agents/justhireme/` | MIT-licensed deterministic ATS scoring engine |
| `agents/sources/` | Greenhouse/Lever/Ashby/Workable adapters (desktop) |

## Stub flags

All external API calls have a stub mode for local dev and CI:

| Flag | Default | Stubs |
|---|---|---|
| `STUB_ANTHROPIC=1` | 0 | Returns fixture tailor/cover letter/prep output |
| `STUB_JOBS_API=1` | 0 | Returns 12-job fixture set |
| `STUB_RESEND=1` | 0 | Captures sends in in-memory outbox |
| `STUB_EXPO_PUSH=1` | 0 | Captures pushes in in-memory outbox |
| `STUB_LEMONSQUEEZY=1` | 0 | Returns stub checkout URL, no real API calls |
| `APPNAME_DISABLE_SCHEDULER=1` | 0 | Prevents APScheduler from starting (tests) |

## Deploy → Render

Render auto-detects `render.yaml`. Set all env vars from `.env.example` in the dashboard. See `DEPLOY.md` for the full ops checklist.
