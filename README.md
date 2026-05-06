# [AppName] — Phases 1–5 (backend) + 4a (web UI)

Multi-tenant SaaS job-search platform. Desktop variant uses the same backend
in local mode (BYOK Anthropic key, SQLite, local files). Phase 4a is the
Next.js 15 web frontend wired to all 26 backend endpoints.

## Repo layout

```
appname/
├── backend/        # FastAPI + SQLite (desktop) / Supabase (SaaS)
│   ├── main.py
│   ├── storage/    # StorageAdapter (Sqlite | Supabase)
│   ├── jobs/       # JSearch fetcher + tagger + pipeline
│   ├── resumes/    # Sonnet parser + file storage adapter
│   ├── tailor/     # AI tailor: scorer + sonnet + PDF render
│   ├── agents/justhireme/  # MIT-licensed scoring engine
│   └── tests/      # 53 tests, pytest-asyncio
├── web/            # Next.js 15 (App Router) + Tailwind v4 + Zustand
│   ├── app/        # /jobs, /tracker, /resume, /tailored, /signin
│   ├── components/ # JobCard, KanbanBoard (inlined), TailorPanel, etc.
│   └── lib/        # api.ts (typed client), store.ts (Zustand), types.ts
└── LICENSE-justhireme   # MIT credit for ported scoring engine
```

## Run the stack (desktop dev mode, no signups)

### 1. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt   # or install fastapi uvicorn aiosqlite anthropic httpx pydantic weasyprint python-multipart
APPNAME_MODE=desktop STUB_JOBS_API=1 STUB_ANTHROPIC=1 \
  uvicorn backend.main:app --reload
```

The console prints a per-launch token:

```
[AppName] mode=desktop  api_token=8cc5f978...
```

Copy this. You'll paste it into the web UI.

### 2. Web

```bash
cd web
cp .env.example .env.local  # NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
npm install --legacy-peer-deps
npm run dev
```

Open `http://localhost:3000`. You'll be redirected to `/signin`. Paste the
backend token. The token is stored in `localStorage` and attached as a
Bearer header to every API call.

### 3. Mobile

```bash
cd mobile
npm install --legacy-peer-deps
# Backend URL — point at your dev machine's LAN IP (Expo Go can't resolve 127.0.0.1)
echo 'EXPO_PUBLIC_API_URL=http://192.168.1.x:8000' > .env.local
npx expo start
```

Scan the QR code with Expo Go (iOS/Android). On first launch you'll land on
the Sign-in screen — paste the backend token. The token is stored in the
device Keychain/Keystore via `expo-secure-store`.

The app uses Expo Router 4 (file-based, mirrors `web/app/` layout):

```
mobile/app/
├── _layout.tsx        # Root Stack
├── index.tsx          # Redirect to /(tabs)/jobs or /signin
├── signin.tsx         # Token paste screen
├── (tabs)/
│   ├── jobs.tsx       # Job feed (FlatList)
│   ├── tracker.tsx    # Status filter chips + ApplicationCard list
│   ├── resume.tsx     # Upload (expo-document-picker) + manual builder
│   └── tailored.tsx   # List + ScoreCircle + Share PDF (expo-sharing)
└── jobs/[id].tsx      # Detail + Tailor + Save to tracker
```

### 4. Try it

1. Click **Ingest sample jobs** on the `/jobs` sidebar (12 fixture jobs land).
2. Go to `/resume` and either upload a `.txt` resume or use the builder.
3. Open any job → **Tailor for this job** → see ATS score + match points + gaps.
4. Download the PDF (real WeasyPrint output).
5. Drag application cards between the 8 kanban columns on `/tracker`.

## Stubs vs production

| Variable             | Default | Effect                                                    |
|----------------------|---------|-----------------------------------------------------------|
| `STUB_JOBS_API=1`    | dev on  | Skip JSearch HTTP, load `jobs/fixtures/sample_jobs.json` |
| `STUB_ANTHROPIC=1`   | dev on  | Skip Sonnet/Haiku, use deterministic heuristics           |
| `ANTHROPIC_API_KEY`  | unset   | Real Sonnet for tailor + parser when stubs are off        |
| `APPNAME_MODE`       | `desktop` | `saas` flips to SupabaseAdapter (NotImplementedError until provisioned) |

## Tier gates

Enforced server-side in `main.py`:

| Plan      | Tracker (active apps) | Tailor / month |
|-----------|-----------------------|----------------|
| `free`    | 10                    | 3              |
| `pro`     | unlimited             | 100            |
| `coach`   | unlimited             | 100 + bulk     |
| `desktop` | unlimited             | unlimited (BYOK) |

Default plan in dev mode is `desktop` (set when `upsert_user` runs at boot
in `local_token.py`). Override per-test with `storage.upsert_user(uid, mail, plan='free')`.

## Tests

```bash
cd backend
APPNAME_MODE=desktop STUB_JOBS_API=1 STUB_ANTHROPIC=1 \
  python -m pytest backend/tests/ -q
```

53 tests, ~6s.

## What's not done yet

- Phase 6 — Email digest + push notifications (Resend + Expo Push)
- Phase 7 — Supabase signup, RLS, real Auth (replaces local token flow)
- Phase 8 — Cover letter + interview prep (more Sonnet calls)
- Phase 9 — LemonSqueezy billing + Coach bulk tailor
- Phase 10 — Tauri desktop variant (free product, BYOK)
