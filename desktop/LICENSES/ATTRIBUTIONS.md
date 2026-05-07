## Third-party attributions

AppName builds on these open-source projects. Each is credited per its
license terms.

### JustHireMe — vasu-devs

- License: MIT
- Repo: https://github.com/vasu-devs/justhireme
- What we use: quality_gate scoring, lead_intel deterministic scorers,
  free_scout source patterns, Tauri sidecar architecture
- Full license text: `LICENSE-justhireme.md`

### career-ops

- License: MIT
- What we use: 8-stage tracker pipeline design, status-history schema,
  field/level taxonomy
- See `backend/storage/sqlite_schema.sql` and `backend/main.py` (tracker
  endpoints) for code paths derived from this work.

### ai-resume-analyzer

- License: MIT
- What we use: ATS keyword extraction approach, structured-output
  resume tailor pattern with hard-constraint system prompt
- See `backend/tailor/sonnet.py` and `backend/tailor/service.py`.

### Direct dependencies

Tauri (MIT), Next.js (MIT), FastAPI (MIT), React (MIT), Tailwind (MIT),
Anthropic SDK (MIT), WeasyPrint (BSD-3), httpx (BSD-3), APScheduler (MIT),
SQLite (public domain), uvicorn (BSD-3), pydantic (MIT), portpicker (MIT).

Full transitive dependency licenses ship in the installer alongside the
bundled binaries. Run "About → Licenses" inside the app to view them at
runtime.
