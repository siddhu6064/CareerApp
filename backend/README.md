# [AppName] Backend

FastAPI backend. Mode-aware via `APPNAME_MODE` env var:

- **`saas`** (default) — multi-tenant cloud, requires Supabase
- **`desktop`** — single-user local, requires nothing external (Phase 10 deployment + your dev environment)

This is **Phase 1 — Foundation**. The skeleton runs end-to-end on SQLite with no signups required.

---

## Run locally (no signups)

```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt

APPNAME_MODE=desktop uvicorn backend.main:app --reload
```

You'll see a line like:

```
[AppName] mode=desktop  api_token=a1b2c3...
```

Copy that token and use it as the bearer for authenticated endpoints.

```bash
curl http://127.0.0.1:8000/health
curl -H "Authorization: Bearer <token>" http://127.0.0.1:8000/api/me
```

Data lives at `~/.appname/data.db` (override with `APPNAME_DATA_DIR`).

---

## Run tests

```bash
cd backend
APPNAME_MODE=desktop pytest
```

10 tests covering storage adapter contract + endpoint integration.

---

## Architecture

### Storage adapter pattern (PRD v5.1 §14 advisory)

Every endpoint reads/writes through `StorageAdapter` — never calls Supabase or
sqlite3 directly.

```
backend/storage/
├── base.py             # abstract StorageAdapter
├── sqlite_adapter.py   # SQLite impl (desktop + local dev)
├── supabase_adapter.py # Supabase impl (SaaS — stub for Phase 1)
├── sqlite_schema.sql   # SQLite DDL
└── __init__.py         # get_storage() factory
```

Endpoint code is mode-agnostic:

```python
from backend.storage import get_storage
storage = get_storage()
user = await storage.get_user(user_id)
```

To run against Supabase later: implement the methods in `supabase_adapter.py`,
set `APPNAME_MODE=saas` + Supabase env vars. Endpoint code does not change.

### Auth

Same pattern:

```
backend/auth/
├── __init__.py        # selects impl by APPNAME_MODE
├── local_token.py     # desktop bearer token
└── supabase_jwt.py    # SaaS JWT (Phase 1.x)
```

```python
from backend.auth import require_user

@app.get("/api/me")
async def me(user_id: str = Depends(require_user)):
    ...
```

---

## What's included (Phase 1)

- ✅ Mode-aware config (`backend/config.py`)
- ✅ `StorageAdapter` interface + working `SqliteAdapter`
- ✅ `SupabaseAdapter` stub (raises `NotImplementedError` until Phase 1.x)
- ✅ Local bearer-token auth (desktop) + Supabase JWT stub (SaaS)
- ✅ `GET /health` (public)
- ✅ `GET /api/me` (auth-gated)
- ✅ `backend/agents/justhireme/` — 11 ported files from `vasu-devs/justhireme` (MIT, attribution preserved)
- ✅ Test suite: 10 tests passing
- ✅ CORS locked to local origins

## What's next (Phase 1.x → 2)

- [ ] Implement `SupabaseAdapter` methods (when Supabase project exists)
- [ ] Implement Supabase JWT verification in `auth/supabase_jwt.py`
- [ ] Add migrations runner with `schema_version` table support
- [ ] Phase 2 — JSearch integration + `jobs` endpoints + Haiku tagging + `quality_gate` integration
- [ ] Phase 3 — Resume parse + tracker + tailor

---

## Open source attribution

`backend/agents/justhireme/` contains files imported from
[vasu-devs/justhireme](https://github.com/vasu-devs/justhireme) under MIT.
License at `/LICENSE-justhireme`. Per-file attribution headers preserved.

See `appname-imports/docs/PORT_NOTES.md` for the integration plan per file.
