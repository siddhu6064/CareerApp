-- [AppName] Supabase schema — PostgreSQL + Row Level Security.
-- Paste this entire file into Supabase Dashboard → SQL Editor and run it.
-- Safe to run multiple times (all statements use CREATE IF NOT EXISTS / OR REPLACE).
--
-- After running:
--   1. Dashboard → Database → Replication → enable "applications" table for Realtime
--   2. Dashboard → Authentication → Providers → enable Google OAuth + Email/Password
--   3. Add your domain to Authentication → URL Configuration → Redirect URLs

-- ── Extensions ───────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ══════════════════════════════════════════════════════════════════════
-- TABLES
-- ══════════════════════════════════════════════════════════════════════

-- ── users ─────────────────────────────────────────────────────────────
-- Mirrors auth.users (Supabase manages auth). We keep a profile row here
-- for plan, preferences, and tailor counts.
CREATE TABLE IF NOT EXISTS public.users (
    id                    TEXT PRIMARY KEY,   -- matches auth.users.id (UUID as text)
    email                 TEXT NOT NULL,
    plan                  TEXT NOT NULL DEFAULT 'free',  -- free|pro|coach|desktop
    field                 TEXT,
    level                 TEXT,
    location              TEXT,
    remote_pref           TEXT,
    tailor_count_month    INTEGER NOT NULL DEFAULT 0,
    tailor_count_reset_at TIMESTAMPTZ,
    email_digest_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
    digest_frequency      TEXT NOT NULL DEFAULT 'daily',
    digest_remote_only    BOOLEAN NOT NULL DEFAULT FALSE,
    digest_salary_min     INTEGER,
    push_token            TEXT,
    coach_logo_path       TEXT,
    coach_brand_color     TEXT,
    -- Phase 7: LemonSqueezy billing
    ls_subscription_id    TEXT,
    ls_customer_id        TEXT,
    ls_variant_id         TEXT,
    plan_renewal_at       TIMESTAMPTZ,
    plan_ends_at          TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── jobs ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.jobs (
    id            TEXT PRIMARY KEY,
    job_hash      TEXT UNIQUE NOT NULL,
    title         TEXT NOT NULL,
    company       TEXT NOT NULL,
    location      TEXT,
    remote_type   TEXT,
    field         TEXT,
    level         TEXT,
    tech_stack    JSONB NOT NULL DEFAULT '[]',
    jd_raw        TEXT,
    apply_url     TEXT,
    posted_date   TEXT,
    source        TEXT,
    quality_score INTEGER,
    salary_min    INTEGER,
    salary_max    INTEGER,
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_active        ON public.jobs(active);
CREATE INDEX IF NOT EXISTS idx_jobs_field         ON public.jobs(field);
CREATE INDEX IF NOT EXISTS idx_jobs_level         ON public.jobs(level);
CREATE INDEX IF NOT EXISTS idx_jobs_remote_type   ON public.jobs(remote_type);
CREATE INDEX IF NOT EXISTS idx_jobs_quality_score ON public.jobs(quality_score);
CREATE INDEX IF NOT EXISTS idx_jobs_expires_at    ON public.jobs(expires_at);

-- ── master_resumes ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.master_resumes (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    contact_info    JSONB,
    summary         TEXT,
    experience      JSONB NOT NULL DEFAULT '[]',
    education       JSONB NOT NULL DEFAULT '[]',
    skills          JSONB NOT NULL DEFAULT '[]',
    projects        JSONB NOT NULL DEFAULT '[]',
    certifications  JSONB NOT NULL DEFAULT '[]',
    pdf_path        TEXT,
    source          TEXT NOT NULL DEFAULT 'app',
    parse_method    TEXT,
    raw_filename    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_master_resumes_user ON public.master_resumes(user_id, created_at DESC);

-- ── applications ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.applications (
    id                  TEXT PRIMARY KEY,
    user_id             TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    job_id              TEXT REFERENCES public.jobs(id) ON DELETE SET NULL,
    tailored_resume_id  TEXT,
    title               TEXT NOT NULL,
    company             TEXT NOT NULL,
    platform            TEXT,
    status              TEXT NOT NULL DEFAULT 'saved',
    status_history      JSONB NOT NULL DEFAULT '[]',
    starred             BOOLEAN NOT NULL DEFAULT FALSE,
    applied_at          TIMESTAMPTZ,
    follow_up_date      DATE,
    follow_up_notified  BOOLEAN NOT NULL DEFAULT FALSE,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_applications_user        ON public.applications(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_user_status ON public.applications(user_id, status);

-- ── recruiter_contacts ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recruiter_contacts (
    id              TEXT PRIMARY KEY,
    application_id  TEXT NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    role            TEXT,
    email           TEXT,
    phone           TEXT,
    linkedin_url    TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_application ON public.recruiter_contacts(application_id);

-- ── interviews ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.interviews (
    id                TEXT PRIMARY KEY,
    application_id    TEXT NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
    round             TEXT NOT NULL,
    scheduled_at      TIMESTAMPTZ,
    duration_min      INTEGER,
    interviewer_names JSONB NOT NULL DEFAULT '[]',
    location          TEXT,
    notes             TEXT,
    outcome           TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interviews_application ON public.interviews(application_id, scheduled_at);

-- ── salary_details ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.salary_details (
    id              TEXT PRIMARY KEY,
    application_id  TEXT NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
    base_min        INTEGER,
    base_max        INTEGER,
    bonus           INTEGER,
    equity_value    INTEGER,
    equity_vesting  TEXT,
    currency        TEXT DEFAULT 'USD',
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_salary_application ON public.salary_details(application_id);

-- ── tailored_resumes ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tailored_resumes (
    id               TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    job_id           TEXT REFERENCES public.jobs(id) ON DELETE SET NULL,
    master_resume_id TEXT NOT NULL REFERENCES public.master_resumes(id) ON DELETE CASCADE,
    content_markdown TEXT,
    ats_score        INTEGER,
    match_points     JSONB NOT NULL DEFAULT '[]',
    gaps             JSONB NOT NULL DEFAULT '[]',
    keywords_added   JSONB NOT NULL DEFAULT '[]',
    pdf_path         TEXT,
    source           TEXT NOT NULL DEFAULT 'app',
    sonnet_method    TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tailored_user_created ON public.tailored_resumes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tailored_user_job     ON public.tailored_resumes(user_id, job_id);

-- ── cover_letters ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cover_letters (
    id                  TEXT PRIMARY KEY,
    user_id             TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    job_id              TEXT NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    tailored_resume_id  TEXT REFERENCES public.tailored_resumes(id) ON DELETE SET NULL,
    content_markdown    TEXT NOT NULL,
    tone                TEXT NOT NULL DEFAULT 'professional',
    pdf_path            TEXT,
    sonnet_method       TEXT,
    tokens_in           INTEGER DEFAULT 0,
    tokens_out          INTEGER DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cover_letters_user_job ON public.cover_letters(user_id, job_id, created_at DESC);

-- ── interview_prep ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.interview_prep (
    id               TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    job_id           TEXT NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    questions        JSONB NOT NULL DEFAULT '[]',
    strengths        JSONB NOT NULL DEFAULT '[]',
    gaps_to_address  JSONB NOT NULL DEFAULT '[]',
    talking_points   JSONB NOT NULL DEFAULT '[]',
    haiku_method     TEXT,
    tokens_in        INTEGER DEFAULT 0,
    tokens_out       INTEGER DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interview_prep_user_job ON public.interview_prep(user_id, job_id, created_at DESC);

-- ── email_digest_log ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_digest_log (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    subject     TEXT,
    job_ids     JSONB NOT NULL DEFAULT '[]',
    opened_at   TIMESTAMPTZ,
    clicked_at  TIMESTAMPTZ,
    resend_id   TEXT
);

CREATE INDEX IF NOT EXISTS idx_digest_log_user       ON public.email_digest_log(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_digest_log_resend_id  ON public.email_digest_log(resend_id);

-- ── push_tokens ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_tokens (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    expo_token   TEXT NOT NULL UNIQUE,
    platform     TEXT,
    device_name  TEXT,
    enabled      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ,
    last_error   TEXT
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON public.push_tokens(user_id, enabled);

-- ── push_notifications ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_notifications (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    kind            TEXT NOT NULL,
    title           TEXT,
    body            TEXT,
    application_id  TEXT
);

-- ── notification_preferences ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    user_id           TEXT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    digest_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
    push_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
    digest_count      INTEGER NOT NULL DEFAULT 5,
    digest_hour_utc   INTEGER NOT NULL DEFAULT 6,
    timezone          TEXT NOT NULL DEFAULT 'UTC',
    unsubscribe_token TEXT,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── coach_clients ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coach_clients (
    id              TEXT PRIMARY KEY,
    coach_id        TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    client_id       TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    invited_email   TEXT NOT NULL,
    invited_name    TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',
    invite_token    TEXT NOT NULL UNIQUE,
    invited_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at     TIMESTAMPTZ,
    notes           TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_clients_pending
    ON public.coach_clients(coach_id, invited_email)
    WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_clients_active
    ON public.coach_clients(coach_id, client_id)
    WHERE status = 'active' AND client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_coach_clients_coach  ON public.coach_clients(coach_id, status);
CREATE INDEX IF NOT EXISTS idx_coach_clients_client ON public.coach_clients(client_id);

-- ══════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════════════
-- All tables use the same pattern: users can only read/write their own rows.
-- The service role key (used by the backend) bypasses RLS automatically.
-- RLS applies to anon and authenticated roles only.

ALTER TABLE public.users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_resumes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruiter_contacts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interviews          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_details      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tailored_resumes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cover_letters       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_prep      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_digest_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_tokens         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_notifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_clients       ENABLE ROW LEVEL SECURITY;

-- Jobs are shared (read by all, written only by service role)
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated users can read jobs"
    ON public.jobs FOR SELECT TO authenticated USING (true);

-- users: own row only
CREATE POLICY "users manage own profile"
    ON public.users FOR ALL TO authenticated
    USING (id = auth.uid()::text)
    WITH CHECK (id = auth.uid()::text);

-- master_resumes
CREATE POLICY "users manage own resumes"
    ON public.master_resumes FOR ALL TO authenticated
    USING (user_id = auth.uid()::text)
    WITH CHECK (user_id = auth.uid()::text);

-- applications
CREATE POLICY "users manage own applications"
    ON public.applications FOR ALL TO authenticated
    USING (user_id = auth.uid()::text)
    WITH CHECK (user_id = auth.uid()::text);

-- recruiter_contacts: accessible if user owns the parent application
CREATE POLICY "users manage own contacts"
    ON public.recruiter_contacts FOR ALL TO authenticated
    USING (
        application_id IN (
            SELECT id FROM public.applications WHERE user_id = auth.uid()::text
        )
    );

-- interviews
CREATE POLICY "users manage own interviews"
    ON public.interviews FOR ALL TO authenticated
    USING (
        application_id IN (
            SELECT id FROM public.applications WHERE user_id = auth.uid()::text
        )
    );

-- salary_details
CREATE POLICY "users manage own salary"
    ON public.salary_details FOR ALL TO authenticated
    USING (
        application_id IN (
            SELECT id FROM public.applications WHERE user_id = auth.uid()::text
        )
    );

-- tailored_resumes
CREATE POLICY "users manage own tailored resumes"
    ON public.tailored_resumes FOR ALL TO authenticated
    USING (user_id = auth.uid()::text)
    WITH CHECK (user_id = auth.uid()::text);

-- cover_letters
CREATE POLICY "users manage own cover letters"
    ON public.cover_letters FOR ALL TO authenticated
    USING (user_id = auth.uid()::text)
    WITH CHECK (user_id = auth.uid()::text);

-- interview_prep
CREATE POLICY "users manage own interview prep"
    ON public.interview_prep FOR ALL TO authenticated
    USING (user_id = auth.uid()::text)
    WITH CHECK (user_id = auth.uid()::text);

-- email_digest_log
CREATE POLICY "users read own digest log"
    ON public.email_digest_log FOR SELECT TO authenticated
    USING (user_id = auth.uid()::text);

-- push_tokens
CREATE POLICY "users manage own push tokens"
    ON public.push_tokens FOR ALL TO authenticated
    USING (user_id = auth.uid()::text)
    WITH CHECK (user_id = auth.uid()::text);

-- push_notifications
CREATE POLICY "users read own push notifications"
    ON public.push_notifications FOR SELECT TO authenticated
    USING (user_id = auth.uid()::text);

-- notification_preferences
CREATE POLICY "users manage own notification prefs"
    ON public.notification_preferences FOR ALL TO authenticated
    USING (user_id = auth.uid()::text)
    WITH CHECK (user_id = auth.uid()::text);

-- coach_clients: coach sees rows where coach_id = me; client sees rows where client_id = me
CREATE POLICY "coach manages own clients"
    ON public.coach_clients FOR ALL TO authenticated
    USING (
        coach_id = auth.uid()::text
        OR client_id = auth.uid()::text
    )
    WITH CHECK (coach_id = auth.uid()::text);

-- ══════════════════════════════════════════════════════════════════════
-- REALTIME
-- Enable Realtime on applications so web and mobile get live updates.
-- Run after the table is created (Dashboard → Database → Replication,
-- or use this SQL if you prefer not to use the dashboard).
-- ══════════════════════════════════════════════════════════════════════

-- Supabase Realtime is configured per-table in the dashboard. The SQL
-- equivalent is to add the table to the supabase_realtime publication:
ALTER PUBLICATION supabase_realtime ADD TABLE public.applications;

-- ══════════════════════════════════════════════════════════════════════
-- TRIGGER: auto-create user profile row on sign-up
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.users (id, email, plan)
    VALUES (
        NEW.id::text,
        NEW.email,
        'free'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
