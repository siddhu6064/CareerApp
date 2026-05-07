# Changelog

All notable changes to [AppName] are documented here.  
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) ·
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Phase 7 — Billing (LemonSqueezy webhooks, plan upgrades, upgrade modals) ← in progress

---

## [0.1.0] — Planned

First public release of [AppName]. Covers the full MVP loop: sign up, upload
resume, browse daily digest, tailor to a job, track applications, and receive
push and email reminders.

### SaaS

**Foundation**
- Next.js 15 web app, FastAPI backend, Expo SDK 52 mobile app
- Supabase (PostgreSQL + Auth + Realtime), Cloudflare R2, Render deployment
- StorageAdapter pattern — same backend code serves both SaaS and desktop modes

**Job Feed (Phase 2)**
- JSearch (primary) + Adzuna (fallback) job ingestion via GitHub Actions cron
- Claude Haiku tagging: field, level, tech stack, remote type
- Dedup, TTL cache, quality gate, field count endpoint

**Resume + Tracker API (Phase 3)**
- PDF/DOCX/TXT upload with Claude Sonnet parsing
- Master resume (append-only, versioned)
- 8-stage application tracker (saved → accepted/rejected)
- Recruiter contacts, interview rounds, salary details, status history
- Supabase JWT middleware (HS256, audience=authenticated)
- `PUT /api/me/preferences` — field, level, location, remote preference

**Web UI (Phase 4a)**
- 3-step onboarding (upload resume → set prefs → feed)
- Job feed with filter sidebar and ATS grade badges (A/B/C/D/F)
- HTML5 drag-drop kanban tracker with 8 columns
- Add-application modal (manual entry)
- Before/after diff view and PDF iframe preview on tailor result
- Supabase Realtime subscription (skeleton, activates on deploy)

**Mobile (Phase 4b)**
- Expo Router tabs: Feed, Tracker, Resume, Tailored, Analytics
- Horizontal snap-scroll kanban with swipe gestures (right=advance, left=reject)
- MMKV offline-first tracker — reads from cache on boot, syncs on reconnect
- Pending sync queue — enqueues offline edits, flushes on reconnect
- Recruiter contact screen with one-tap call/email/LinkedIn
- Universal deep links (`appname://jobs/[id]`, `/applications/[id]`)
- Push notification tap → navigate to application detail

**AI Tailor + PDF (Phase 5)**
- Claude Sonnet structured tailoring with hard fabrication constraints
- WeasyPrint PDF generation with ATS-optimised HTML template
- Deterministic ATS scoring via JustHireMe scoring_engine (MIT)
- Free: 3 tailors/month · Pro: 100 · Desktop: unlimited
- Upgrade modal on 402 (free limit hit)

**Notifications (Phase 6)**
- Daily digest email via Resend — top 5 ATS pre-scored jobs per user
- One-click unsubscribe token in every email footer
- Resend webhook handler: open/click/bounce → `email_digest_log`
- Digest preview endpoint (`GET /api/digest/preview`) for settings page
- Expo push notifications: interview reminders (24h), follow-up reminders, stale alerts (14+ days)
- Push notification tap → deep link to application

**Pro Features (Phase 8)**
- Cover letter generation (Claude Sonnet, 3 tones)
- Interview prep: 5 questions + answer frameworks + strengths/gaps (mobile offline-cached)
- Analytics dashboard: response rate, funnel, ATS correlation, digest engagement
- Before/after diff view with keyword highlighting

**Coach Tier (Phase 9)**
- 10 client profiles, bulk tailor, read-only client tracker
- White-label PDF export with coach branding

### Desktop (Phase 10)

- SQLite storage adapter — single-user, no RLS, full offline
- BYOK Anthropic + GitHub key management via OS keychain (Tauri stronghold)
- Greenhouse / Lever / Ashby / Workable job source adapters (no paid API)
- APScheduler 6am daily fetch (respects user's local timezone)
- Tauri 2 shell: sidecar FastAPI binary, system tray, minimize-to-tray
- Auto-updater with ed25519 signature verification
- Next.js static export bundled into the app binary
- GitHub Actions matrix build: macOS arm64/x64, Windows x64, Linux x64

---

## Links

- [Repository](https://github.com/siddhu6064/CareerApp)
- [Desktop downloads](https://desktop.appname.io)
- [Desktop README](desktop/README.md)
