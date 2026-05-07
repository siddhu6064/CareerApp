"""Supabase implementation of StorageAdapter. Default for SaaS mode.

NOTE: This is a stub for Phase 1. Real implementation lands when Supabase
project exists. Until then, every method raises NotImplementedError. To work
locally without Supabase signup, set APPNAME_MODE=desktop and use SqliteAdapter.

Design contract: every method must return data in the SAME SHAPE as
SqliteAdapter — so endpoint code is identical across both adapters.
"""
from __future__ import annotations

from typing import Any

from backend.storage.base import StorageAdapter


class SupabaseAdapter(StorageAdapter):
    def __init__(self, url: str, service_key: str):
        if not url or not service_key:
            raise RuntimeError(
                "SupabaseAdapter requires SUPABASE_URL and SUPABASE_SERVICE_KEY. "
                "For local dev without Supabase signup, set APPNAME_MODE=desktop."
            )
        self._url = url
        self._service_key = service_key

    async def connect(self) -> None:
        # Real impl: from supabase import create_client; self._client = create_client(...)
        raise NotImplementedError("SupabaseAdapter.connect — implement when Supabase project exists")

    async def disconnect(self) -> None:
        return None  # supabase-py is stateless

    async def healthcheck(self) -> dict[str, Any]:
        raise NotImplementedError

    async def get_user(self, user_id: str) -> dict[str, Any] | None:
        raise NotImplementedError

    async def upsert_user(self, user_id: str, email: str, plan: str = "free") -> dict[str, Any]:
        raise NotImplementedError

    async def update_user_preferences(
        self,
        user_id: str,
        field: str | None = None,
        level: str | None = None,
        location: str | None = None,
        remote_pref: str | None = None,
    ) -> dict[str, Any]:
        raise NotImplementedError

    async def increment_tailor_count(self, user_id: str) -> int:
        raise NotImplementedError

    async def get_setting(self, key: str) -> str | None:
        # In SaaS mode, settings live in env vars or per-user config tables — not this kv store.
        return None

    async def set_setting(self, key: str, value: str) -> None:
        raise NotImplementedError("Settings storage is desktop-only in current architecture")

    # ── Jobs ─────────────────────────────────────────────────────────────
    async def upsert_job(self, job):
        raise NotImplementedError

    async def get_job(self, job_id: str):
        raise NotImplementedError

    async def list_jobs(self, **kwargs):
        raise NotImplementedError

    async def count_jobs_by_field(self):
        raise NotImplementedError

    async def mark_expired_jobs(self) -> int:
        raise NotImplementedError

    # ── Phase 3 stubs ────────────────────────────────────────────────────
    async def upsert_master_resume(self, resume): raise NotImplementedError
    async def get_active_master_resume(self, user_id): raise NotImplementedError
    async def get_master_resume(self, resume_id, user_id): raise NotImplementedError
    async def create_application(self, app): raise NotImplementedError
    async def get_application(self, application_id, user_id): raise NotImplementedError
    async def list_applications(self, user_id, **kwargs): raise NotImplementedError
    async def update_application(self, application_id, user_id, patch): raise NotImplementedError
    async def delete_application(self, application_id, user_id): raise NotImplementedError
    async def count_active_applications(self, user_id): raise NotImplementedError
    async def add_recruiter_contact(self, contact): raise NotImplementedError
    async def list_recruiter_contacts(self, application_id): raise NotImplementedError
    async def add_interview(self, interview): raise NotImplementedError
    async def list_interviews(self, application_id): raise NotImplementedError
    async def update_interview(self, interview_id, application_id, patch): raise NotImplementedError
    async def add_salary_details(self, salary): raise NotImplementedError
    async def list_salary_details(self, application_id): raise NotImplementedError

    # ── Phase 5 stubs (match StorageAdapter abstract contract) ──────────
    async def save_tailored_resume(self, tailored): raise NotImplementedError
    async def get_tailored_resume(self, tailored_id, user_id): raise NotImplementedError
    async def list_tailored_resumes(self, user_id, **kwargs): raise NotImplementedError
    async def reset_tailor_count_if_due(self, user_id): raise NotImplementedError

    # ── Phase 8 stubs ────────────────────────────────────────────────────
    async def save_cover_letter(self, cover): raise NotImplementedError
    async def get_cover_letter(self, cover_id, user_id): raise NotImplementedError
    async def list_cover_letters(self, user_id, **kwargs): raise NotImplementedError
    async def save_interview_prep(self, prep): raise NotImplementedError
    async def get_interview_prep(self, prep_id, user_id): raise NotImplementedError
    async def get_latest_interview_prep_for_job(self, user_id, job_id): raise NotImplementedError
    async def list_interview_prep(self, user_id, **kwargs): raise NotImplementedError

    # ── Phase 6 stubs ────────────────────────────────────────────────────
    async def upsert_push_token(self, user_id, expo_token, **kwargs): raise NotImplementedError
    async def list_push_tokens(self, user_id, **kwargs): raise NotImplementedError
    async def disable_push_token(self, expo_token, **kwargs): raise NotImplementedError
    async def get_notification_preferences(self, user_id): raise NotImplementedError
    async def update_notification_preferences(self, user_id, patch): raise NotImplementedError
    async def list_users_for_digest(self, digest_hour_utc): raise NotImplementedError
    async def log_email_digest(self, user_id, **kwargs): raise NotImplementedError
    async def log_push_notification(self, user_id, **kwargs): raise NotImplementedError
    async def applications_with_due_follow_ups(self): raise NotImplementedError
    async def applications_with_upcoming_interviews(self, **kwargs): raise NotImplementedError
    async def stale_applications(self, **kwargs): raise NotImplementedError
    async def jobs_for_user_digest(self, user_id, **kwargs): raise NotImplementedError

    # ── Phase 8 analytics stubs ─────────────────────────────────────────
    async def list_applications_since(self, user_id, **kwargs): raise NotImplementedError
    async def tailored_resumes_by_ids(self, user_id, ids): raise NotImplementedError
    async def digest_log_since(self, user_id, **kwargs): raise NotImplementedError
    async def count_tailored_resumes_since(self, user_id, **kwargs): raise NotImplementedError

    # ── Phase 9 coach stubs ─────────────────────────────────────────────
    async def get_user_by_email(self, email): raise NotImplementedError
    async def add_coach_client(self, coach_id, **kwargs): raise NotImplementedError
    async def get_coach_client(self, coach_client_id, coach_id): raise NotImplementedError
    async def get_coach_client_by_token(self, invite_token): raise NotImplementedError
    async def list_coach_clients(self, coach_id, **kwargs): raise NotImplementedError
    async def count_coach_clients(self, coach_id, **kwargs): raise NotImplementedError
    async def accept_coach_invite(self, invite_token, accepting_user_id): raise NotImplementedError
    async def remove_coach_client(self, coach_client_id, coach_id): raise NotImplementedError
    async def update_coach_client(self, coach_client_id, coach_id, patch): raise NotImplementedError
    async def update_coach_branding(self, coach_id, **kwargs): raise NotImplementedError
    async def get_coach_branding(self, coach_id): raise NotImplementedError
