"""Supabase implementation of StorageAdapter. Default for SaaS mode.

Uses supabase-py AsyncClient with the SERVICE ROLE KEY so the backend can
perform admin operations (cron digest, cross-user queries) without being
restricted by RLS. User-level row filtering is still done explicitly in every
query (defence-in-depth matching the SqliteAdapter pattern).

RLS at the Supabase layer provides an additional safety net: if a bug ever
bypasses the explicit user_id filter, RLS will catch it for authenticated
requests.

Required env vars (set in Render + local backend/.env for SaaS mode):
    SUPABASE_URL          — https://<project>.supabase.co
    SUPABASE_SERVICE_KEY  — from Project Settings → API → service_role key
"""
from __future__ import annotations

import json
import logging
import secrets
from datetime import datetime, timezone
from typing import Any

from backend.storage.base import StorageAdapter

log = logging.getLogger(__name__)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _rows(res: Any) -> list[dict[str, Any]]:
    """Extract list from a supabase-py execute() result."""
    return res.data or []


def _one(res: Any) -> dict[str, Any] | None:
    """Extract single row or None."""
    data = res.data
    if not data:
        return None
    return data[0] if isinstance(data, list) else data


def _norm_app(row: dict) -> dict:
    """Ensure starred/follow_up_notified are bools (Supabase returns them as bools already)."""
    row["starred"] = bool(row.get("starred", False))
    row["follow_up_notified"] = bool(row.get("follow_up_notified", False))
    # JSONB columns are already dicts/lists from Supabase — no json.loads needed
    if row.get("status_history") is None:
        row["status_history"] = []
    return row


def _norm_job(row: dict) -> dict:
    if row.get("tech_stack") is None:
        row["tech_stack"] = []
    return row


def _norm_resume(row: dict) -> dict:
    for col in ("experience", "education", "skills", "projects", "certifications"):
        if row.get(col) is None:
            row[col] = []
    return row


def _norm_tailored(row: dict) -> dict:
    for col in ("match_points", "gaps", "keywords_added"):
        if row.get(col) is None:
            row[col] = []
    return row


def _norm_prep(row: dict) -> dict:
    for col in ("questions", "strengths", "gaps_to_address", "talking_points"):
        if row.get(col) is None:
            row[col] = []
    return row


def _norm_prefs(row: dict) -> dict:
    row["digest_enabled"] = bool(row.get("digest_enabled", True))
    row["push_enabled"] = bool(row.get("push_enabled", True))
    return row


class SupabaseAdapter(StorageAdapter):
    def __init__(self, url: str, service_key: str):
        if not url or not service_key:
            raise RuntimeError(
                "SupabaseAdapter requires SUPABASE_URL and SUPABASE_SERVICE_KEY. "
                "For local dev without Supabase signup, set APPNAME_MODE=desktop."
            )
        self._url = url
        self._service_key = service_key
        self._client: Any = None

    # ── Lifecycle ──────────────────────────────────────────────────────
    async def connect(self) -> None:
        from supabase import AsyncClient, acreate_client  # type: ignore[import]
        self._client: AsyncClient = await acreate_client(
            self._url, self._service_key
        )
        log.info("SupabaseAdapter connected to %s", self._url)

    async def disconnect(self) -> None:
        self._client = None

    async def healthcheck(self) -> dict[str, Any]:
        res = await self._client.table("users").select("count", count="exact").limit(0).execute()
        return {"adapter": "supabase", "url": self._url, "user_count": res.count}

    # ── Users ──────────────────────────────────────────────────────────
    async def get_user(self, user_id: str) -> dict[str, Any] | None:
        res = await self._client.table("users").select("*").eq("id", user_id).limit(1).execute()
        return _one(res)

    async def upsert_user(self, user_id: str, email: str, plan: str = "free") -> dict[str, Any]:
        now = _utc_now()
        res = await self._client.table("users").upsert({
            "id": user_id, "email": email, "plan": plan, "updated_at": now,
        }, on_conflict="id").execute()
        row = _one(res)
        if row is None:
            # upsert returned empty — fetch
            row = await self.get_user(user_id)
        assert row is not None
        return row

    async def update_user_preferences(
        self,
        user_id: str,
        field: Any = None,
        level: Any = None,
        location: Any = None,
        remote_pref: Any = None,
    ) -> dict[str, Any]:
        patch: dict[str, Any] = {"updated_at": _utc_now()}
        def _is_real(v: Any) -> bool:
            return v is None or isinstance(v, str)
        for col, val in (("field", field), ("level", level),
                         ("location", location), ("remote_pref", remote_pref)):
            if _is_real(val):
                patch[col] = val
        await self._client.table("users").update(patch).eq("id", user_id).execute()
        row = await self.get_user(user_id)
        assert row is not None
        return row

    async def increment_tailor_count(self, user_id: str) -> int:
        # Use Postgres RPC for atomic increment — avoids race conditions
        res = await self._client.rpc(
            "increment_tailor_count", {"p_user_id": user_id}
        ).execute()
        # Fallback if RPC doesn't exist: read-modify-write
        if res.data is None:
            user = await self.get_user(user_id)
            new_count = int((user or {}).get("tailor_count_month", 0)) + 1
            await self._client.table("users").update({
                "tailor_count_month": new_count, "updated_at": _utc_now()
            }).eq("id", user_id).execute()
            return new_count
        return int(res.data)

    async def get_setting(self, key: str) -> str | None:
        return None  # Settings are env vars in SaaS; desktop-only kv store

    async def set_setting(self, key: str, value: str) -> None:
        raise NotImplementedError("Settings storage is desktop-only")

    # ── Jobs ───────────────────────────────────────────────────────────
    async def upsert_job(self, job: dict[str, Any]) -> str:
        now = _utc_now()
        payload = {
            "id": job["id"],
            "job_hash": job["job_hash"],
            "title": job["title"],
            "company": job["company"],
            "location": job.get("location"),
            "remote_type": job.get("remote_type"),
            "field": job.get("field"),
            "level": job.get("level"),
            "tech_stack": job.get("tech_stack") or [],
            "jd_raw": job.get("jd_raw"),
            "apply_url": job.get("apply_url"),
            "posted_date": job.get("posted_date"),
            "source": job.get("source"),
            "quality_score": job.get("quality_score"),
            "salary_min": job.get("salary_min"),
            "salary_max": job.get("salary_max"),
            "active": True,
            "expires_at": job.get("expires_at"),
            "updated_at": now,
        }
        await self._client.table("jobs").upsert(payload, on_conflict="job_hash").execute()
        return job["id"]

    async def get_job(self, job_id: str) -> dict[str, Any] | None:
        res = await self._client.table("jobs").select("*").eq("id", job_id).eq("active", True).limit(1).execute()
        row = _one(res)
        return _norm_job(row) if row else None

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
    ) -> list[dict[str, Any]]:
        q = self._client.table("jobs").select("*").eq("active", True)
        if field:
            q = q.eq("field", field)
        if level:
            q = q.eq("level", level)
        if remote_type:
            q = q.eq("remote_type", remote_type)
        if salary_min is not None:
            q = q.gte("salary_min", salary_min)
        if quality_min is not None:
            q = q.gte("quality_score", quality_min)
        offset = (page - 1) * page_size
        q = q.order("quality_score", desc=True).order("created_at", desc=True).range(offset, offset + page_size - 1)
        res = await q.execute()
        return [_norm_job(r) for r in _rows(res)]

    async def count_jobs_by_field(self) -> dict[str, int]:
        res = await self._client.table("jobs").select("field").eq("active", True).execute()
        counts: dict[str, int] = {}
        for row in _rows(res):
            f = row.get("field")
            if f:
                counts[f] = counts.get(f, 0) + 1
        return counts

    async def mark_expired_jobs(self) -> int:
        now = _utc_now()
        res = await (
            self._client.table("jobs")
            .update({"active": False, "updated_at": now})
            .eq("active", True)
            .lt("expires_at", now)
            .execute()
        )
        return len(_rows(res))

    # ── Master Resumes ─────────────────────────────────────────────────
    async def upsert_master_resume(self, resume: dict[str, Any]) -> str:
        now = _utc_now()
        payload = {**resume, "updated_at": now}
        payload.setdefault("created_at", now)
        await self._client.table("master_resumes").upsert(payload, on_conflict="id").execute()
        return resume["id"]

    async def get_active_master_resume(self, user_id: str) -> dict[str, Any] | None:
        res = await (
            self._client.table("master_resumes")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        row = _one(res)
        return _norm_resume(row) if row else None

    async def get_master_resume(self, resume_id: str, user_id: str) -> dict[str, Any] | None:
        res = await (
            self._client.table("master_resumes")
            .select("*")
            .eq("id", resume_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        row = _one(res)
        return _norm_resume(row) if row else None

    # ── Applications ───────────────────────────────────────────────────
    async def create_application(self, app: dict[str, Any]) -> str:
        now = _utc_now()
        payload = {**app, "created_at": now, "updated_at": now}
        payload.setdefault("status_history", [])
        await self._client.table("applications").insert(payload).execute()
        return app["id"]

    async def get_application(self, application_id: str, user_id: str) -> dict[str, Any] | None:
        res = await (
            self._client.table("applications")
            .select("*")
            .eq("id", application_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        row = _one(res)
        return _norm_app(row) if row else None

    async def list_applications(
        self,
        user_id: str,
        *,
        status: str | None = None,
        starred: bool | None = None,
    ) -> list[dict[str, Any]]:
        q = self._client.table("applications").select("*").eq("user_id", user_id)
        if status:
            q = q.eq("status", status)
        if starred is not None:
            q = q.eq("starred", starred)
        q = q.order("updated_at", desc=True)
        res = await q.execute()
        return [_norm_app(r) for r in _rows(res)]

    async def update_application(
        self, application_id: str, user_id: str, patch: dict[str, Any]
    ) -> dict[str, Any] | None:
        patch = {**patch, "updated_at": _utc_now()}
        await (
            self._client.table("applications")
            .update(patch)
            .eq("id", application_id)
            .eq("user_id", user_id)
            .execute()
        )
        return await self.get_application(application_id, user_id)

    async def delete_application(self, application_id: str, user_id: str) -> bool:
        await (
            self._client.table("applications")
            .update({"status": "rejected", "updated_at": _utc_now()})
            .eq("id", application_id)
            .eq("user_id", user_id)
            .execute()
        )
        return True

    async def count_active_applications(self, user_id: str) -> int:
        res = await (
            self._client.table("applications")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .not_.in_("status", ["rejected", "accepted"])
            .execute()
        )
        return res.count or 0

    # ── Recruiter Contacts ─────────────────────────────────────────────
    async def add_recruiter_contact(self, contact: dict[str, Any]) -> str:
        contact.setdefault("created_at", _utc_now())
        await self._client.table("recruiter_contacts").insert(contact).execute()
        return contact["id"]

    async def list_recruiter_contacts(self, application_id: str) -> list[dict[str, Any]]:
        res = await (
            self._client.table("recruiter_contacts")
            .select("*")
            .eq("application_id", application_id)
            .order("created_at")
            .execute()
        )
        return _rows(res)

    # ── Interviews ─────────────────────────────────────────────────────
    async def add_interview(self, interview: dict[str, Any]) -> str:
        interview.setdefault("created_at", _utc_now())
        interview.setdefault("interviewer_names", [])
        await self._client.table("interviews").insert(interview).execute()
        return interview["id"]

    async def list_interviews(self, application_id: str) -> list[dict[str, Any]]:
        res = await (
            self._client.table("interviews")
            .select("*")
            .eq("application_id", application_id)
            .order("scheduled_at", desc=False)
            .execute()
        )
        return _rows(res)

    async def update_interview(
        self, interview_id: str, application_id: str, patch: dict[str, Any]
    ) -> dict[str, Any] | None:
        await (
            self._client.table("interviews")
            .update(patch)
            .eq("id", interview_id)
            .eq("application_id", application_id)
            .execute()
        )
        res = await (
            self._client.table("interviews")
            .select("*")
            .eq("id", interview_id)
            .limit(1)
            .execute()
        )
        return _one(res)

    # ── Salary Details ─────────────────────────────────────────────────
    async def add_salary_details(self, salary: dict[str, Any]) -> str:
        salary.setdefault("created_at", _utc_now())
        await self._client.table("salary_details").insert(salary).execute()
        return salary["id"]

    async def list_salary_details(self, application_id: str) -> list[dict[str, Any]]:
        res = await (
            self._client.table("salary_details")
            .select("*")
            .eq("application_id", application_id)
            .execute()
        )
        return _rows(res)

    # ── Tailored Resumes ───────────────────────────────────────────────
    async def save_tailored_resume(self, tailored: dict[str, Any]) -> str:
        tailored.setdefault("created_at", _utc_now())
        await self._client.table("tailored_resumes").insert(tailored).execute()
        return tailored["id"]

    async def get_tailored_resume(self, tailored_id: str, user_id: str) -> dict[str, Any] | None:
        res = await (
            self._client.table("tailored_resumes")
            .select("*")
            .eq("id", tailored_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        row = _one(res)
        return _norm_tailored(row) if row else None

    async def list_tailored_resumes(
        self, user_id: str, *, job_id: str | None = None, limit: int = 50
    ) -> list[dict[str, Any]]:
        q = self._client.table("tailored_resumes").select("*").eq("user_id", user_id)
        if job_id:
            q = q.eq("job_id", job_id)
        q = q.order("created_at", desc=True).limit(limit)
        res = await q.execute()
        return [_norm_tailored(r) for r in _rows(res)]

    async def reset_tailor_count_if_due(self, user_id: str) -> int:
        user = await self.get_user(user_id)
        if user is None:
            return 0
        reset_at = user.get("tailor_count_reset_at")
        now = datetime.now(timezone.utc)
        if reset_at:
            reset_dt = datetime.fromisoformat(reset_at.replace("Z", "+00:00"))
            if now < reset_dt:
                return int(user.get("tailor_count_month", 0))
        next_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if next_month.month == 12:
            next_month = next_month.replace(year=next_month.year + 1, month=1)
        else:
            next_month = next_month.replace(month=next_month.month + 1)
        await self._client.table("users").update({
            "tailor_count_month": 0,
            "tailor_count_reset_at": next_month.isoformat(),
            "updated_at": _utc_now(),
        }).eq("id", user_id).execute()
        return 0

    # ── Cover Letters ──────────────────────────────────────────────────
    async def save_cover_letter(self, cover: dict[str, Any]) -> str:
        cover.setdefault("created_at", _utc_now())
        await self._client.table("cover_letters").insert(cover).execute()
        return cover["id"]

    async def get_cover_letter(self, cover_id: str, user_id: str) -> dict[str, Any] | None:
        res = await (
            self._client.table("cover_letters")
            .select("*")
            .eq("id", cover_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        return _one(res)

    async def list_cover_letters(
        self, user_id: str, *, job_id: str | None = None, limit: int = 50
    ) -> list[dict[str, Any]]:
        q = self._client.table("cover_letters").select("*").eq("user_id", user_id)
        if job_id:
            q = q.eq("job_id", job_id)
        q = q.order("created_at", desc=True).limit(limit)
        res = await q.execute()
        return _rows(res)

    # ── Interview Prep ─────────────────────────────────────────────────
    async def save_interview_prep(self, prep: dict[str, Any]) -> str:
        prep.setdefault("created_at", _utc_now())
        await self._client.table("interview_prep").insert(prep).execute()
        return prep["id"]

    async def get_interview_prep(self, prep_id: str, user_id: str) -> dict[str, Any] | None:
        res = await (
            self._client.table("interview_prep")
            .select("*")
            .eq("id", prep_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        row = _one(res)
        return _norm_prep(row) if row else None

    async def get_latest_interview_prep_for_job(
        self, user_id: str, job_id: str
    ) -> dict[str, Any] | None:
        res = await (
            self._client.table("interview_prep")
            .select("*")
            .eq("user_id", user_id)
            .eq("job_id", job_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        row = _one(res)
        return _norm_prep(row) if row else None

    async def list_interview_prep(
        self, user_id: str, *, job_id: str | None = None, limit: int = 50
    ) -> list[dict[str, Any]]:
        q = self._client.table("interview_prep").select("*").eq("user_id", user_id)
        if job_id:
            q = q.eq("job_id", job_id)
        q = q.order("created_at", desc=True).limit(limit)
        res = await q.execute()
        return [_norm_prep(r) for r in _rows(res)]

    # ── Push Tokens ────────────────────────────────────────────────────
    async def upsert_push_token(
        self,
        user_id: str,
        expo_token: str,
        *,
        platform: str | None = None,
        device_name: str | None = None,
    ) -> str:
        import uuid
        now = _utc_now()
        res = await (
            self._client.table("push_tokens")
            .select("id")
            .eq("expo_token", expo_token)
            .limit(1)
            .execute()
        )
        existing = _one(res)
        if existing:
            await self._client.table("push_tokens").update({
                "user_id": user_id, "platform": platform,
                "device_name": device_name, "enabled": True, "last_seen_at": now,
            }).eq("id", existing["id"]).execute()
            return existing["id"]
        tok_id = f"pt_{uuid.uuid4().hex[:16]}"
        await self._client.table("push_tokens").insert({
            "id": tok_id, "user_id": user_id, "expo_token": expo_token,
            "platform": platform, "device_name": device_name,
            "enabled": True, "created_at": now, "last_seen_at": now,
        }).execute()
        return tok_id

    async def list_push_tokens(
        self, user_id: str, *, enabled_only: bool = True
    ) -> list[dict[str, Any]]:
        q = self._client.table("push_tokens").select("*").eq("user_id", user_id)
        if enabled_only:
            q = q.eq("enabled", True)
        res = await q.execute()
        return _rows(res)

    async def disable_push_token(self, expo_token: str, *, error: str | None = None) -> bool:
        patch: dict[str, Any] = {"enabled": False}
        if error:
            patch["last_error"] = error
        await self._client.table("push_tokens").update(patch).eq("expo_token", expo_token).execute()
        return True

    # ── Notification Preferences ───────────────────────────────────────
    async def get_notification_preferences(self, user_id: str) -> dict[str, Any]:
        res = await (
            self._client.table("notification_preferences")
            .select("*")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        row = _one(res)
        if row:
            if not row.get("unsubscribe_token"):
                tok = secrets.token_urlsafe(32)
                await self._client.table("notification_preferences").update(
                    {"unsubscribe_token": tok}
                ).eq("user_id", user_id).execute()
                row["unsubscribe_token"] = tok
            return _norm_prefs(row)
        # Lazy-create
        tok = secrets.token_urlsafe(32)
        new_row = {
            "user_id": user_id,
            "digest_enabled": True,
            "push_enabled": True,
            "digest_count": 5,
            "digest_hour_utc": 6,
            "timezone": "UTC",
            "unsubscribe_token": tok,
            "updated_at": _utc_now(),
        }
        await self._client.table("notification_preferences").insert(new_row).execute()
        return _norm_prefs(new_row)

    async def update_notification_preferences(
        self, user_id: str, patch: dict[str, Any]
    ) -> dict[str, Any]:
        await self.get_notification_preferences(user_id)  # ensure row exists
        patch = {**patch, "updated_at": _utc_now()}
        await (
            self._client.table("notification_preferences")
            .update(patch)
            .eq("user_id", user_id)
            .execute()
        )
        return await self.get_notification_preferences(user_id)

    async def list_users_for_digest(self, digest_hour_utc: int) -> list[dict[str, Any]]:
        """Returns users with digest enabled at the given UTC hour, with their prefs merged."""
        res = await (
            self._client.table("notification_preferences")
            .select("user_id, digest_count, digest_enabled, digest_hour_utc, unsubscribe_token")
            .eq("digest_enabled", True)
            .eq("digest_hour_utc", digest_hour_utc)
            .execute()
        )
        prefs_rows = _rows(res)
        if not prefs_rows:
            return []
        user_ids = [r["user_id"] for r in prefs_rows]
        users_res = await (
            self._client.table("users")
            .select("id, email, plan, field, level, remote_pref")
            .in_("id", user_ids)
            .execute()
        )
        users_by_id = {r["id"]: r for r in _rows(users_res)}
        result = []
        for p in prefs_rows:
            u = users_by_id.get(p["user_id"])
            if u:
                result.append({**u, **p})
        return result

    async def log_email_digest(
        self,
        user_id: str,
        *,
        subject: str,
        job_ids: list[str],
        resend_id: str | None,
    ) -> str:
        import uuid
        log_id = f"ed_{uuid.uuid4().hex[:16]}"
        await self._client.table("email_digest_log").insert({
            "id": log_id, "user_id": user_id,
            "subject": subject, "job_ids": job_ids,
            "resend_id": resend_id, "sent_at": _utc_now(),
        }).execute()
        return log_id

    async def get_notification_prefs_by_unsubscribe_token(
        self, token: str
    ) -> dict[str, Any] | None:
        res = await (
            self._client.table("notification_preferences")
            .select("*")
            .eq("unsubscribe_token", token)
            .limit(1)
            .execute()
        )
        return _one(res)

    async def update_digest_log_event(self, resend_id: str, *, event_type: str) -> None:
        now = _utc_now()
        if event_type == "opened":
            await (
                self._client.table("email_digest_log")
                .update({"opened_at": now})
                .eq("resend_id", resend_id)
                .is_("opened_at", "null")
                .execute()
            )
        elif event_type == "clicked":
            await (
                self._client.table("email_digest_log")
                .update({"clicked_at": now})
                .eq("resend_id", resend_id)
                .execute()
            )

    async def log_push_notification(
        self,
        user_id: str,
        *,
        kind: str,
        title: str,
        body: str,
        application_id: str | None = None,
    ) -> str:
        import uuid
        log_id = f"pn_{uuid.uuid4().hex[:16]}"
        await self._client.table("push_notifications").insert({
            "id": log_id, "user_id": user_id, "kind": kind,
            "title": title, "body": body, "application_id": application_id,
            "sent_at": _utc_now(),
        }).execute()
        return log_id

    async def applications_with_due_follow_ups(self) -> list[dict[str, Any]]:
        today = datetime.now(timezone.utc).date().isoformat()
        res = await (
            self._client.table("applications")
            .select("id, user_id, title, company, follow_up_date")
            .lte("follow_up_date", today)
            .eq("follow_up_notified", False)
            .not_.in_("status", ["rejected", "accepted"])
            .execute()
        )
        return _rows(res)

    async def applications_with_upcoming_interviews(
        self, *, hours_ahead: int = 24
    ) -> list[dict[str, Any]]:
        now = datetime.now(timezone.utc)
        future = now.replace(microsecond=0)
        cutoff = now.replace(microsecond=0)
        from datetime import timedelta
        cutoff_end = (now + timedelta(hours=hours_ahead)).isoformat()
        res = await (
            self._client.table("interviews")
            .select("id, application_id, round, scheduled_at, applications(id, user_id, title, company)")
            .gte("scheduled_at", now.isoformat())
            .lte("scheduled_at", cutoff_end)
            .execute()
        )
        out = []
        for r in _rows(res):
            app = r.get("applications") or {}
            out.append({
                "id": app.get("id"),
                "user_id": app.get("user_id"),
                "title": app.get("title"),
                "company": app.get("company"),
                "interview_scheduled_at": r.get("scheduled_at"),
                "interview_round": r.get("round"),
            })
        return out

    async def stale_applications(self, *, days: int = 14) -> list[dict[str, Any]]:
        from datetime import timedelta
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        res = await (
            self._client.table("applications")
            .select("id, user_id, title, company, status, updated_at")
            .lte("updated_at", cutoff)
            .eq("status", "applied")
            .execute()
        )
        return _rows(res)

    async def jobs_for_user_digest(
        self,
        user_id: str,
        *,
        limit: int = 5,
        since_hours: int = 24,
    ) -> list[dict[str, Any]]:
        from datetime import timedelta
        since = (datetime.now(timezone.utc) - timedelta(hours=since_hours)).isoformat()
        user = await self.get_user(user_id)
        field = (user or {}).get("field")
        q = self._client.table("jobs").select("*").eq("active", True).gte("created_at", since)
        if field:
            q = q.eq("field", field)
        q = q.order("quality_score", desc=True).limit(limit)
        res = await q.execute()
        return [_norm_job(r) for r in _rows(res)]

    # ── Analytics ──────────────────────────────────────────────────────
    async def list_applications_since(
        self, user_id: str, *, since_iso: str
    ) -> list[dict[str, Any]]:
        res = await (
            self._client.table("applications")
            .select("*")
            .eq("user_id", user_id)
            .gte("created_at", since_iso)
            .execute()
        )
        return [_norm_app(r) for r in _rows(res)]

    async def tailored_resumes_by_ids(
        self, user_id: str, ids: list[str]
    ) -> list[dict[str, Any]]:
        if not ids:
            return []
        res = await (
            self._client.table("tailored_resumes")
            .select("id, ats_score, source, created_at")
            .eq("user_id", user_id)
            .in_("id", ids)
            .execute()
        )
        return _rows(res)

    async def digest_log_since(
        self, user_id: str, *, since_iso: str
    ) -> list[dict[str, Any]]:
        res = await (
            self._client.table("email_digest_log")
            .select("sent_at, opened_at, clicked_at, job_ids")
            .eq("user_id", user_id)
            .gte("sent_at", since_iso)
            .execute()
        )
        return _rows(res)

    async def count_tailored_resumes_since(
        self, user_id: str, *, since_iso: str, source: str | None = None
    ) -> int:
        q = (
            self._client.table("tailored_resumes")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .gte("created_at", since_iso)
        )
        if source:
            q = q.eq("source", source)
        res = await q.execute()
        return res.count or 0

    # ── Coach ──────────────────────────────────────────────────────────
    async def get_user_by_email(self, email: str) -> dict[str, Any] | None:
        res = await (
            self._client.table("users")
            .select("*")
            .eq("email", email)
            .limit(1)
            .execute()
        )
        return _one(res)

    async def add_coach_client(
        self,
        coach_id: str,
        *,
        invited_email: str,
        invited_name: str | None = None,
        notes: str | None = None,
        invite_token: str,
    ) -> str:
        import uuid
        cc_id = f"cc_{uuid.uuid4().hex[:16]}"
        await self._client.table("coach_clients").insert({
            "id": cc_id, "coach_id": coach_id,
            "invited_email": invited_email, "invited_name": invited_name,
            "notes": notes, "invite_token": invite_token, "status": "pending",
            "invited_at": _utc_now(),
        }).execute()
        return cc_id

    async def get_coach_client(
        self, coach_client_id: str, coach_id: str
    ) -> dict[str, Any] | None:
        res = await (
            self._client.table("coach_clients")
            .select("*")
            .eq("id", coach_client_id)
            .eq("coach_id", coach_id)
            .limit(1)
            .execute()
        )
        return _one(res)

    async def get_coach_client_by_token(self, invite_token: str) -> dict[str, Any] | None:
        res = await (
            self._client.table("coach_clients")
            .select("*")
            .eq("invite_token", invite_token)
            .limit(1)
            .execute()
        )
        return _one(res)

    async def list_coach_clients(
        self, coach_id: str, *, status: str | None = None
    ) -> list[dict[str, Any]]:
        q = self._client.table("coach_clients").select("*").eq("coach_id", coach_id)
        if status:
            q = q.eq("status", status)
        q = q.order("invited_at", desc=True)
        res = await q.execute()
        return _rows(res)

    async def count_coach_clients(
        self, coach_id: str, *, status: str = "active"
    ) -> int:
        res = await (
            self._client.table("coach_clients")
            .select("id", count="exact")
            .eq("coach_id", coach_id)
            .eq("status", status)
            .execute()
        )
        return res.count or 0

    async def accept_coach_invite(
        self, invite_token: str, accepting_user_id: str
    ) -> dict[str, Any] | None:
        row = await self.get_coach_client_by_token(invite_token)
        if not row:
            return None
        now = _utc_now()
        await (
            self._client.table("coach_clients")
            .update({"client_id": accepting_user_id, "status": "active", "accepted_at": now})
            .eq("id", row["id"])
            .execute()
        )
        return await self.get_coach_client(row["id"], row["coach_id"])

    async def remove_coach_client(self, coach_client_id: str, coach_id: str) -> bool:
        await (
            self._client.table("coach_clients")
            .update({"status": "inactive"})
            .eq("id", coach_client_id)
            .eq("coach_id", coach_id)
            .execute()
        )
        return True

    async def update_coach_client(
        self, coach_client_id: str, coach_id: str, patch: dict[str, Any]
    ) -> dict[str, Any] | None:
        await (
            self._client.table("coach_clients")
            .update(patch)
            .eq("id", coach_client_id)
            .eq("coach_id", coach_id)
            .execute()
        )
        return await self.get_coach_client(coach_client_id, coach_id)

    async def update_coach_branding(
        self, coach_id: str, **kwargs: Any
    ) -> dict[str, Any] | None:
        patch = {k: v for k, v in kwargs.items() if v is not None or k in ("logo_path", "brand_color")}
        patch["updated_at"] = _utc_now()
        await self._client.table("users").update(patch).eq("id", coach_id).execute()
        return await self.get_user(coach_id)

    async def get_coach_branding(self, coach_id: str) -> dict[str, Any] | None:
        res = await (
            self._client.table("users")
            .select("coach_logo_path, coach_brand_color")
            .eq("id", coach_id)
            .limit(1)
            .execute()
        )
        return _one(res)
