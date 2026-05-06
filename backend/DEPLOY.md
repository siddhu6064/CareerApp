# Backend deploy

The backend ships as a Docker image. WeasyPrint needs Pango/Cairo/HarfBuzz
native libs — they're baked into the runtime stage.

## Render (production)

1. Connect the repo to Render and create a Blueprint deploy from `render.yaml`.
2. Set these dashboard env vars (all `sync: false` — never committed):
   - `ANTHROPIC_API_KEY`
   - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWT_SECRET`
   - `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`
   - `JSEARCH_API_KEY`, `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`
   - `RESEND_API_KEY`
3. Render auto-generates `INTERNAL_SECRET`. Copy it into GitHub Actions
   secrets as `INTERNAL_SECRET` so the cron jobs can call internal endpoints.
4. Health check is `GET /health` (already wired in the Dockerfile).

The Starter plan ($7/mo, 512 MB) handles ~50 concurrent users in our
benchmarks. WeasyPrint is the memory-hungry path — bump to Standard if
average tailor latency p95 exceeds 4s.

## Local Docker

```bash
# From the repo root (so the build context can see backend/ and skill files)
docker build -t appname-api -f backend/Dockerfile .
docker run --rm -p 8000:8000 \
  -e APPNAME_MODE=desktop \
  -e STUB_JOBS_API=1 -e STUB_ANTHROPIC=1 \
  appname-api
```

In desktop mode the SQLite DB is written inside the container — fine for a
smoke test, but use a volume mount if you need it to survive restarts:
`-v $(pwd)/data:/home/appname/.appname`.

## Image size budget

- `python:3.12-slim-bookworm` base: ~125 MB
- WeasyPrint native deps: ~120 MB
- Python wheels: ~80 MB
- App source: <2 MB
- **Final image target: ~330 MB.** If it grows past 450 MB, audit
  apt packages — `fonts-liberation` and `fonts-dejavu-core` are the
  biggest single contributors and could be replaced with a single font.

## Troubleshooting

- **`OSError: cannot load library 'libpangoft2-1.0.so.0'`** — runtime stage
  is missing native deps. Confirm the apt-get block ran and that the base
  image is `slim` (not `alpine` — musl breaks WeasyPrint).
- **PDFs render but fonts look wrong** — the locale-default font is
  missing. Add the family you need via `fonts-noto-cjk` or `fonts-noto-color-emoji`.
- **WeasyPrint warns "Ignored ... at-rule"** — these are harmless CSS
  features Print CSS doesn't support; safe to ignore.
