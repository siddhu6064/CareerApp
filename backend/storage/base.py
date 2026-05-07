"""Abstract storage adapter. SaaS uses SupabaseAdapter; Desktop uses SqliteAdapter.

Every backend endpoint reads/writes through this interface — never calls Supabase
or sqlite3 directly. This is the v5.1 advisory enforcement point.

Add new methods here as endpoints are built. Both adapters must implement.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class StorageAdapter(ABC):
    """Single async interface implemented by both SupabaseAdapter and SqliteAdapter."""

    # ── Lifecycle ────────────────────────────────────────────────────────
    @abstractmethod
    async def connect(self) -> None:
        """Open connections, run migrations if needed."""

    @abstractmethod
    async def disconnect(self) -> None:
        """Close connections cleanly on shutdown."""

    @abstractmethod
    async def healthcheck(self) -> dict[str, Any]:
        """Return adapter-specific status. Used by /health."""

    # ── Users ────────────────────────────────────────────────────────────
    @abstractmethod
    async def get_user(self, user_id: str) -> dict[str, Any] | None:
        """Fetch a user row by id. Returns None if not found."""

    @abstractmethod
    async def upsert_user(
        self,
        user_id: str,
        email: str,
        plan: str = "free",
    ) -> dict[str, Any]:
        """Insert or update a user row. Returns the resulting row."""

    @abstractmethod
    async def increment_tailor_count(self, user_id: str) -> int:
        """Increment monthly tailor count, return new value. Used for Free tier gate."""

    # ── Settings (desktop-only API key storage; no-op in SaaS) ──────────
    @abstractmethod
    async def get_setting(self, key: str) -> str | None:
        """Read a key=value row from the settings table. Desktop uses this for BYOK."""

    @abstractmethod
    async def set_setting(self, key: str, value: str) -> None:
        """Upsert a key=value row in the settings table."""

    # ── Jobs (Phase 2) ───────────────────────────────────────────────────
    @abstractmethod
    async def upsert_job(self, job: dict[str, Any]) -> str:
        """Insert or update a job row. Dedup is on job_hash. Returns job id."""

    @abstractmethod
    async def get_job(self, job_id: str) -> dict[str, Any] | None:
        """Fetch a single active job by id. Returns None if not found or expired."""

    @abstractmethod
    async def list_jobs(
        self,
        *,
        field: str | None = None,
        level: str | None = None,
        remote_type: str | None = None,
        salary_min: int | None = None,
        quality_min: int | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        """Paginated job listing. Returns { items, total, page, page_size }."""

    @abstractmethod
    async def count_jobs_by_field(self) -> dict[str, int]:
        """Return {field_name: count} for active jobs. Powers filter UI badges."""

    @abstractmethod
    async def mark_expired_jobs(self) -> int:
        """Set active=0 where expires_at < now(). Returns count marked."""

    # ── Master resumes (Phase 3) ─────────────────────────────────────────
    @abstractmethod
    async def upsert_master_resume(self, resume: dict[str, Any]) -> str:
        """Insert a new master resume row. Returns id. Latest row per user is active."""

    @abstractmethod
    async def get_active_master_resume(self, user_id: str) -> dict[str, Any] | None:
        """Return the user's latest master resume, or None if they haven't uploaded one."""

    @abstractmethod
    async def get_master_resume(self, resume_id: str, user_id: str) -> dict[str, Any] | None:
        """Fetch a specific resume scoped by user (RLS in SaaS, defensive in desktop)."""

    # ── Applications (Phase 3) ───────────────────────────────────────────
    @abstractmethod
    async def create_application(self, app: dict[str, Any]) -> str:
        """Create a new application row. Returns id. status_history seeded with creation."""

    @abstractmethod
    async def get_application(self, application_id: str, user_id: str) -> dict[str, Any] | None:
        ...

    @abstractmethod
    async def list_applications(
        self,
        user_id: str,
        *,
        status: str | None = None,
        starred: bool | None = None,
    ) -> list[dict[str, Any]]:
        """User's applications, newest-updated first."""

    @abstractmethod
    async def update_application(
        self,
        application_id: str,
        user_id: str,
        patch: dict[str, Any],
    ) -> dict[str, Any] | None:
        """Apply partial update. Status changes append to status_history."""

    @abstractmethod
    async def delete_application(self, application_id: str, user_id: str) -> bool:
        """Hard delete (cascades sub-resources). Returns True if deleted."""

    @abstractmethod
    async def count_active_applications(self, user_id: str) -> int:
        """Count where status NOT IN (rejected, accepted). Powers Free tier 10-app gate."""

    # ── Application sub-resources ────────────────────────────────────────
    @abstractmethod
    async def add_recruiter_contact(self, contact: dict[str, Any]) -> str:
        ...

    @abstractmethod
    async def list_recruiter_contacts(self, application_id: str) -> list[dict[str, Any]]:
        ...

    @abstractmethod
    async def add_interview(self, interview: dict[str, Any]) -> str:
        ...

    @abstractmethod
    async def list_interviews(self, application_id: str) -> list[dict[str, Any]]:
        ...

    @abstractmethod
    async def update_interview(
        self, interview_id: str, application_id: str, patch: dict[str, Any]
    ) -> dict[str, Any] | None:
        ...

    @abstractmethod
    async def add_salary_details(self, salary: dict[str, Any]) -> str:
        ...

    @abstractmethod
    async def list_salary_details(self, application_id: str) -> list[dict[str, Any]]:
        ...

    # ── Tailored resumes (Phase 5) ───────────────────────────────────────
    @abstractmethod
    async def save_tailored_resume(self, tailored: dict[str, Any]) -> str:
        """Insert a tailored resume row. Returns id."""

    @abstractmethod
    async def get_tailored_resume(
        self, tailored_id: str, user_id: str
    ) -> dict[str, Any] | None:
        ...

    @abstractmethod
    async def list_tailored_resumes(
        self, user_id: str, *, job_id: str | None = None, limit: int = 50
    ) -> list[dict[str, Any]]:
        ...

    @abstractmethod
    async def reset_tailor_count_if_due(self, user_id: str) -> int:
        """If the monthly window has elapsed, reset count to 0 and bump reset_at.
        Returns the current (possibly reset) tailor_count_month value.
        """

    # ── Phase 8: Cover letters + interview prep (Pro/Coach) ──────────────
    @abstractmethod
    async def save_cover_letter(self, cover: dict[str, Any]) -> str:
        ...

    @abstractmethod
    async def get_cover_letter(
        self, cover_id: str, user_id: str
    ) -> dict[str, Any] | None:
        ...

    @abstractmethod
    async def list_cover_letters(
        self, user_id: str, *, job_id: str | None = None, limit: int = 50
    ) -> list[dict[str, Any]]:
        ...

    @abstractmethod
    async def save_interview_prep(self, prep: dict[str, Any]) -> str:
        ...

    @abstractmethod
    async def get_interview_prep(
        self, prep_id: str, user_id: str
    ) -> dict[str, Any] | None:
        ...

    @abstractmethod
    async def get_latest_interview_prep_for_job(
        self, user_id: str, job_id: str
    ) -> dict[str, Any] | None:
        """Most recent interview prep for a (user, job) pair. None if never run."""

    @abstractmethod
    async def list_interview_prep(
        self, user_id: str, *, job_id: str | None = None, limit: int = 50
    ) -> list[dict[str, Any]]:
        ...

    # ── Phase 6: notifications ───────────────────────────────────────────
    @abstractmethod
    async def upsert_push_token(
        self,
        user_id: str,
        expo_token: str,
        *,
        platform: str | None = None,
        device_name: str | None = None,
    ) -> str:
        """Register or refresh a device token. Returns the row id."""

    @abstractmethod
    async def list_push_tokens(self, user_id: str, *, enabled_only: bool = True) -> list[dict[str, Any]]:
        ...

    @abstractmethod
    async def disable_push_token(self, expo_token: str, *, error: str | None = None) -> bool:
        """Mark a token as disabled (e.g. after Expo says DeviceNotRegistered)."""

    @abstractmethod
    async def get_notification_preferences(self, user_id: str) -> dict[str, Any]:
        """Lazy-creates a default preferences row if none exists."""

    @abstractmethod
    async def update_notification_preferences(
        self,
        user_id: str,
        patch: dict[str, Any],
    ) -> dict[str, Any]:
        ...

    @abstractmethod
    async def list_users_for_digest(self, digest_hour_utc: int) -> list[dict[str, Any]]:
        """Users who: have digest_enabled=1, match the hour, have an email."""

    @abstractmethod
    async def log_email_digest(
        self,
        user_id: str,
        *,
        subject: str,
        job_ids: list[str],
        resend_id: str | None,
    ) -> str:
        ...

    @abstractmethod
    async def log_push_notification(
        self,
        user_id: str,
        *,
        kind: str,
        title: str,
        body: str,
        application_id: str | None = None,
    ) -> str:
        ...

    @abstractmethod
    async def applications_with_due_follow_ups(self) -> list[dict[str, Any]]:
        """Applications where follow_up_date <= now AND not yet notified."""

    @abstractmethod
    async def applications_with_upcoming_interviews(self, *, hours_ahead: int = 24) -> list[dict[str, Any]]:
        """Interviews scheduled in the next N hours, with their parent app + user info."""

    @abstractmethod
    async def stale_applications(self, *, days: int = 14) -> list[dict[str, Any]]:
        """Applications stuck in the same status for N+ days."""

    @abstractmethod
    async def jobs_for_user_digest(
        self,
        user_id: str,
        *,
        limit: int = 5,
        since_hours: int = 24,
    ) -> list[dict[str, Any]]:
        """Top N freshly-ingested jobs for a user. Phase 6 picks newest+highest-quality;
        Phase 6.5 will rank by user preferences (saved field/level/locations)."""
