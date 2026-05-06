-- [AppName] SQLite schema. Mirrors PRD §9 Supabase schema with single-user
-- assumptions (no RLS, no tenant filtering needed in desktop mode).
--
-- Migrations are tracked in schema_version. Bump the version row when adding
-- columns and write a forward-only migration in sqlite_adapter.py.

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS schema_version (
    version    INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR IGNORE INTO schema_version (version) VALUES (2);

-- ── users ────────────────────────────────────────────────────────────
-- In desktop mode there is exactly one user row (id = 'local'). In SaaS this
-- table lives in Supabase with RLS; the SqliteAdapter only sees it in desktop.
CREATE TABLE IF NOT EXISTS users (
    id                    TEXT PRIMARY KEY,
    email                 TEXT NOT NULL,
    plan                  TEXT NOT NULL DEFAULT 'free',
    field                 TEXT,
    level                 TEXT,
    location              TEXT,
    remote_pref           TEXT,
    tailor_count_month    INTEGER NOT NULL DEFAULT 0,
    tailor_count_reset_at TEXT,
    email_digest_enabled  INTEGER NOT NULL DEFAULT 1,
    digest_frequency      TEXT NOT NULL DEFAULT 'daily',
    digest_remote_only    INTEGER NOT NULL DEFAULT 0,
    digest_salary_min     INTEGER,
    push_token            TEXT,
    created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ── settings (desktop-only — BYOK key storage) ───────────────────────
-- In desktop mode, user-supplied API keys live here (pre-keychain). In SaaS
-- this table is unused (server env vars instead).
CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ── jobs (full schema for Phase 2) ────────────────────────────────────
-- Phase 5 will add per-user ats_score on tailored_resumes table.
CREATE TABLE IF NOT EXISTS jobs (
    id            TEXT PRIMARY KEY,
    job_hash      TEXT UNIQUE NOT NULL,
    title         TEXT NOT NULL,
    company       TEXT NOT NULL,
    location      TEXT,
    remote_type   TEXT,
    field         TEXT,
    level         TEXT,
    tech_stack    TEXT,                -- JSON-encoded list
    jd_raw        TEXT,
    apply_url     TEXT,
    posted_date   TEXT,
    source        TEXT,
    quality_score INTEGER,             -- from JustHireMe quality_gate (0-100)
    salary_min    INTEGER,
    salary_max    INTEGER,
    active        INTEGER NOT NULL DEFAULT 1,
    expires_at    TEXT,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_active        ON jobs(active);
CREATE INDEX IF NOT EXISTS idx_jobs_field         ON jobs(field);
CREATE INDEX IF NOT EXISTS idx_jobs_level         ON jobs(level);
CREATE INDEX IF NOT EXISTS idx_jobs_remote_type   ON jobs(remote_type);
CREATE INDEX IF NOT EXISTS idx_jobs_quality_score ON jobs(quality_score);
CREATE INDEX IF NOT EXISTS idx_jobs_expires_at    ON jobs(expires_at);
CREATE INDEX IF NOT EXISTS idx_jobs_posted_date   ON jobs(posted_date);

-- ══════════════════════════════════════════════════════════════════════
-- Phase 3 — Resume + Tracker
-- ══════════════════════════════════════════════════════════════════════

-- ── master_resumes ───────────────────────────────────────────────────
-- One row per upload/build. Latest row per user is the "active" master.
-- Phase 5 tailored_resumes will reference this id.
CREATE TABLE IF NOT EXISTS master_resumes (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    contact_info    TEXT,                   -- JSON {name, email, phone, location, linkedin, github, website}
    summary         TEXT,
    experience      TEXT,                   -- JSON list of {role, company, period, description, location}
    education       TEXT,                   -- JSON list of {school, degree, period, notes}
    skills          TEXT,                   -- JSON list of strings
    projects        TEXT,                   -- JSON list of {title, stack, description, url}
    certifications  TEXT,                   -- JSON list of strings
    pdf_path        TEXT,                   -- local path (desktop) or R2 key (SaaS)
    source          TEXT NOT NULL DEFAULT 'app',   -- 'app' | 'digest' | 'linkedin' | 'github'
    parse_method    TEXT,                   -- 'sonnet' | 'stub' | 'manual'
    raw_filename    TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_master_resumes_user ON master_resumes(user_id, created_at DESC);

-- ── applications ─────────────────────────────────────────────────────
-- 8-stage tracker. status_history JSON tracks every transition.
-- Active applications = status NOT IN ('rejected', 'accepted').
CREATE TABLE IF NOT EXISTS applications (
    id                  TEXT PRIMARY KEY,
    user_id             TEXT NOT NULL,
    job_id              TEXT,               -- nullable: user can track a job not in our feed
    tailored_resume_id  TEXT,               -- set in Phase 5 after tailor
    title               TEXT NOT NULL,      -- denormalized for fast list rendering
    company             TEXT NOT NULL,
    platform            TEXT,               -- 'linkedin' | 'lever' | 'greenhouse' | 'manual' | etc
    status              TEXT NOT NULL DEFAULT 'saved',  -- saved|applied|phone_screen|technical|onsite|offer|accepted|rejected
    status_history      TEXT NOT NULL DEFAULT '[]',     -- JSON list of {status, changed_at, note}
    starred             INTEGER NOT NULL DEFAULT 0,
    applied_at          TEXT,
    follow_up_date      TEXT,
    follow_up_notified  INTEGER NOT NULL DEFAULT 0,
    notes               TEXT,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_applications_user        ON applications(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_user_status ON applications(user_id, status);
CREATE INDEX IF NOT EXISTS idx_applications_follow_up   ON applications(follow_up_date) WHERE follow_up_notified = 0;

-- ── recruiter_contacts ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recruiter_contacts (
    id              TEXT PRIMARY KEY,
    application_id  TEXT NOT NULL,
    name            TEXT NOT NULL,
    role            TEXT,                   -- 'recruiter' | 'hiring_manager' | 'interviewer'
    email           TEXT,
    phone           TEXT,
    linkedin_url    TEXT,
    notes           TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_contacts_application ON recruiter_contacts(application_id);

-- ── interviews ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interviews (
    id              TEXT PRIMARY KEY,
    application_id  TEXT NOT NULL,
    round           TEXT NOT NULL,          -- 'phone_screen' | 'technical' | 'onsite' | 'final' | 'recruiter'
    scheduled_at    TEXT,
    duration_min    INTEGER,
    interviewer_names TEXT,                 -- JSON list
    location        TEXT,                   -- 'remote' | physical address | meeting link
    notes           TEXT,
    outcome         TEXT,                   -- 'passed' | 'failed' | 'pending'
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_interviews_application ON interviews(application_id, scheduled_at);

-- ── salary_details ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS salary_details (
    id              TEXT PRIMARY KEY,
    application_id  TEXT NOT NULL,
    base_min        INTEGER,
    base_max        INTEGER,
    bonus           INTEGER,
    equity_value    INTEGER,
    equity_vesting  TEXT,
    currency        TEXT DEFAULT 'USD',
    notes           TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_salary_application ON salary_details(application_id);

-- ── email_digest_log (Phase 6 prep — empty in Phase 3) ──────────────
CREATE TABLE IF NOT EXISTS email_digest_log (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    sent_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    subject         TEXT,
    job_ids         TEXT,                   -- JSON list of job ids surfaced
    opened_at       TEXT,
    clicked_at      TEXT,
    resend_id       TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_digest_log_user ON email_digest_log(user_id, sent_at DESC);

-- ── push_notifications (Phase 6 prep — empty in Phase 3) ────────────
CREATE TABLE IF NOT EXISTS push_notifications (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    sent_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    kind            TEXT NOT NULL,         -- 'interview_reminder' | 'stale_application' | 'follow_up'
    title           TEXT,
    body            TEXT,
    application_id  TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ══════════════════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════
-- Phase 5 — Tailor + PDF
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS tailored_resumes (
    id                       TEXT PRIMARY KEY,
    user_id                  TEXT NOT NULL,
    job_id                   TEXT,
    master_resume_id         TEXT NOT NULL,
    content_markdown         TEXT,                 -- Sonnet output, the tailored resume body
    ats_score                INTEGER,              -- 0-100, from scoring_engine
    match_points             TEXT NOT NULL DEFAULT '[]',   -- JSON list[str]
    gaps                     TEXT NOT NULL DEFAULT '[]',   -- JSON list[str]
    keywords_added           TEXT NOT NULL DEFAULT '[]',   -- JSON list[str]
    pdf_path                 TEXT,
    source                   TEXT NOT NULL DEFAULT 'app',  -- 'app' | 'digest'
    sonnet_method            TEXT,                 -- 'sonnet' | 'stub'
    created_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (master_resume_id) REFERENCES master_resumes(id) ON DELETE CASCADE,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tailored_user_created ON tailored_resumes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tailored_user_job     ON tailored_resumes(user_id, job_id);

INSERT OR IGNORE INTO schema_version (version) VALUES (3);

-- ══════════════════════════════════════════════════════════════════════
-- Phase 8 — Cover Letter + Interview Prep (Pro/Coach features)
-- ══════════════════════════════════════════════════════════════════════
INSERT OR IGNORE INTO schema_version (version) VALUES (4);

-- ── cover_letters ────────────────────────────────────────────────────
-- Sonnet-generated, one row per generation. Latest per (user, job) is the
-- "active" one in UI, but history is preserved for re-generation comparison.
CREATE TABLE IF NOT EXISTS cover_letters (
    id                  TEXT PRIMARY KEY,
    user_id             TEXT NOT NULL,
    job_id              TEXT NOT NULL,
    tailored_resume_id  TEXT,                     -- optional context for the LLM
    content_markdown    TEXT NOT NULL,
    tone                TEXT NOT NULL DEFAULT 'professional',  -- professional | enthusiastic | concise
    pdf_path            TEXT,
    sonnet_method       TEXT,                     -- 'sonnet' | 'stub'
    tokens_in           INTEGER DEFAULT 0,
    tokens_out          INTEGER DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (tailored_resume_id) REFERENCES tailored_resumes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_cover_letters_user_job ON cover_letters(user_id, job_id, created_at DESC);

-- ── interview_prep ───────────────────────────────────────────────────
-- Haiku-generated Q&A bank for a specific job. Latest per (user, job) wins.
CREATE TABLE IF NOT EXISTS interview_prep (
    id                  TEXT PRIMARY KEY,
    user_id             TEXT NOT NULL,
    job_id              TEXT NOT NULL,
    questions           TEXT NOT NULL DEFAULT '[]',  -- JSON [{type, question, why_asked, suggested_approach}]
    strengths           TEXT NOT NULL DEFAULT '[]',  -- JSON [str] — what to emphasize
    gaps_to_address     TEXT NOT NULL DEFAULT '[]',  -- JSON [str] — concerns the JD-vs-resume gap raises
    talking_points      TEXT NOT NULL DEFAULT '[]',  -- JSON [str] — company/role-specific anchors
    haiku_method        TEXT,                          -- 'haiku' | 'stub'
    tokens_in           INTEGER DEFAULT 0,
    tokens_out          INTEGER DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_interview_prep_user_job ON interview_prep(user_id, job_id, created_at DESC);
