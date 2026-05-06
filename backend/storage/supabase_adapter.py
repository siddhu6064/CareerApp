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
