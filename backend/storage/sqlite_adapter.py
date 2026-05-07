"""SQLite implementation of StorageAdapter. Used in:

  - Desktop mode (Phase 10) — only adapter
  - SaaS dev — local dev without Supabase signup (set APPNAME_MODE=desktop)

Uses aiosqlite for async access. Enforces the same async interface as
SupabaseAdapter so endpoint code is identical across modes.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aiosqlite

from backend.storage.base import StorageAdapter

_SCHEMA_PATH = Path(__file__).parent / "sqlite_schema.sql"


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")[:-4] + "Z"


def _add_days(iso_ts: str, days: int) -> str:
    """Take an ISO timestamp, return ISO + N days."""
    from datetime import timedelta
    dt = datetime.fromisoformat(iso_ts.replace("Z", "+00:00"))
    return (dt + timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%S.%fZ")[:-4] + "Z"


def _row_to_job(row: dict[str, Any]) -> dict[str, Any]:
    """Deserialize JSON-encoded fields and normalize types for API output."""
    import json as _json
    out = dict(row)
    if isinstance(out.get("tech_stack"), str):
        try:
            out["tech_stack"] = _json.loads(out["tech_stack"])
        except (ValueError, TypeError):
            out["tech_stack"] = []
    return out


def _row_to_resume(row: dict[str, Any]) -> dict[str, Any]:
    """Deserialize all JSON columns on a master_resumes row."""
    import json as _json
    out = dict(row)
    for col in ("contact_info", "experience", "education", "skills",
                "projects", "certifications"):
        v = out.get(col)
        if isinstance(v, str):
            try:
                out[col] = _json.loads(v)
            except (ValueError, TypeError):
                out[col] = None if col == "contact_info" else []
    return out


def _row_to_application(row: dict[str, Any]) -> dict[str, Any]:
    """Deserialize JSON columns + coerce SQLite ints to bools."""
    import json as _json
    out = dict(row)
    if isinstance(out.get("status_history"), str):
        try:
            out["status_history"] = _json.loads(out["status_history"])
        except (ValueError, TypeError):
            out["status_history"] = []
    out["starred"] = bool(out.get("starred"))
    out["follow_up_notified"] = bool(out.get("follow_up_notified"))
    return out


def _row_to_tailored(row: dict[str, Any]) -> dict[str, Any]:
    import json as _json
    out = dict(row)
    for col in ("match_points", "gaps", "keywords_added"):
        v = out.get(col)
        if isinstance(v, str):
            try:
                out[col] = _json.loads(v)
            except (ValueError, TypeError):
                out[col] = []
    return out


def _next_month_start(now: datetime) -> datetime:
    """Return UTC datetime at the first day of the next month, 00:00."""
    if now.month == 12:
        return datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
    return datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)


def _row_to_prefs(row: dict[str, Any]) -> dict[str, Any]:
    out = dict(row)
    out["digest_enabled"] = bool(out.get("digest_enabled", 1))
    out["push_enabled"] = bool(out.get("push_enabled", 1))
    return out


def _row_to_prep(row: dict[str, Any]) -> dict[str, Any]:
    """Deserialize JSON columns on an interview_prep row."""
    import json as _json
    out = dict(row)
    for col in ("questions", "strengths", "gaps_to_address", "talking_points"):
        v = out.get(col)
        if isinstance(v, str):
            try:
                out[col] = _json.loads(v)
            except (ValueError, TypeError):
                out[col] = []
    return out




class SqliteAdapter(StorageAdapter):
    def __init__(self, db_path: Path):
        self._db_path = db_path
        self._db: aiosqlite.Connection | None = None

    # ── Lifecycle ────────────────────────────────────────────────────────
    async def connect(self) -> None:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._db = await aiosqlite.connect(str(self._db_path))
        self._db.row_factory = aiosqlite.Row
        # Enforce foreign keys + WAL for concurrent reads
        await self._db.execute("PRAGMA foreign_keys = ON")
        await self._db.execute("PRAGMA journal_mode = WAL")
        await self._run_migrations()

    async def disconnect(self) -> None:
        if self._db is not None:
            await self._db.close()
            self._db = None

    async def healthcheck(self) -> dict[str, Any]:
        assert self._db is not None
        async with self._db.execute("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1") as cur:
            row = await cur.fetchone()
        return {
            "adapter": "sqlite",
            "db_path": str(self._db_path),
            "schema_version": row["version"] if row else None,
        }

    async def _run_migrations(self) -> None:
        """Apply schema.sql idempotently. Future: read schema_version and apply deltas."""
        assert self._db is not None
        sql = _SCHEMA_PATH.read_text()
        await self._db.executescript(sql)

        # ── ALTERs for new user columns (forward-only migrations) ──
        # SQLite's ALTER TABLE ... ADD COLUMN can't be IF NOT EXISTS, so
        # introspect first.
        async with self._db.execute("PRAGMA table_info(users)") as cur:
            cols = {row["name"] async for row in cur}
        for name, ddl in (
            ("coach_logo_path", "ALTER TABLE users ADD COLUMN coach_logo_path TEXT"),
            ("coach_brand_color", "ALTER TABLE users ADD COLUMN coach_brand_color TEXT"),
            # Phase 7 — billing
            ("ls_subscription_id", "ALTER TABLE users ADD COLUMN ls_subscription_id TEXT"),
            ("ls_customer_id",     "ALTER TABLE users ADD COLUMN ls_customer_id TEXT"),
            ("ls_variant_id",      "ALTER TABLE users ADD COLUMN ls_variant_id TEXT"),
            ("plan_renewal_at",    "ALTER TABLE users ADD COLUMN plan_renewal_at TEXT"),
            ("plan_ends_at",       "ALTER TABLE users ADD COLUMN plan_ends_at TEXT"),
        ):
            if name not in cols:
                await self._db.execute(ddl)

        # Add unsubscribe_token to notification_preferences if missing
        async with self._db.execute("PRAGMA table_info(notification_preferences)") as cur:
            np_cols = {row["name"] async for row in cur}
        if "unsubscribe_token" not in np_cols:
            await self._db.execute(
                "ALTER TABLE notification_preferences ADD COLUMN unsubscribe_token TEXT"
            )
            # Back-fill existing rows
            import secrets as _secrets
            async with self._db.execute("SELECT user_id FROM notification_preferences") as cur:
                existing = await cur.fetchall()
            for row in existing:
                tok = _secrets.token_urlsafe(32)
                await self._db.execute(
                    "UPDATE notification_preferences SET unsubscribe_token = ? WHERE user_id = ?",
                    (tok, row["user_id"]),
                )

        await self._db.commit()

    # ── Users ────────────────────────────────────────────────────────────
    async def get_user(self, user_id: str) -> dict[str, Any] | None:
        assert self._db is not None
        async with self._db.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ) as cur:
            row = await cur.fetchone()
        return dict(row) if row else None

    async def upsert_user(
        self,
        user_id: str,
        email: str,
        plan: str = "free",
    ) -> dict[str, Any]:
        assert self._db is not None
        now = _utc_now()
        await self._db.execute(
            """
            INSERT INTO users (id, email, plan, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                email = excluded.email,
                plan = excluded.plan,
                updated_at = excluded.updated_at
            """,
            (user_id, email, plan, now, now),
        )
        await self._db.commit()
        user = await self.get_user(user_id)
        assert user is not None
        return user

    async def update_user_preferences(
        self,
        user_id: str,
        field: str | None = None,
        level: str | None = None,
        location: str | None = None,
        remote_pref: str | None = None,
    ) -> dict[str, Any]:
        """Patch job-preference columns. Accepts a sentinel object as a "skip"
        marker so callers can distinguish between explicit null (clear) and
        omitted (leave unchanged). Any value that is not the sentinel object
        (including None) is written to the DB.
        """
        assert self._db is not None
        # Import here to avoid circular dependency with main.py's sentinel
        _SKIP = type(None)  # replaced by actual sentinel check below

        now = _utc_now()
        sets, params = ["updated_at = ?"], [now]

        # The main.py endpoint passes a plain object() as sentinel for "skip".
        # We detect it by checking it's not str and not NoneType (i.e. it's an
        # anonymous object). Simpler: isinstance check for valid types.
        def _should_set(v: Any) -> bool:
            return isinstance(v, (str, type(None))) and not (
                isinstance(v, type) and v is type(None)
            )

        # Actually: sentinel comes in as object() — not str, not None.
        # Real values are str | None. So just check: is the value a str or
        # is it literally the None singleton (not some other type)?
        def _is_real_value(v: Any) -> bool:
            return v is None or isinstance(v, str)

        for col, val in (("field", field), ("level", level),
                         ("location", location), ("remote_pref", remote_pref)):
            if _is_real_value(val):
                sets.append(f"{col} = ?")
                params.append(val)

        params.append(user_id)
        await self._db.execute(
            f"UPDATE users SET {', '.join(sets)} WHERE id = ?",
            params,
        )
        await self._db.commit()
        user = await self.get_user(user_id)
        assert user is not None
        return user

    async def increment_tailor_count(self, user_id: str) -> int:
        assert self._db is not None
        await self._db.execute(
            """
            UPDATE users
            SET tailor_count_month = tailor_count_month + 1,
                updated_at = ?
            WHERE id = ?
            """,
            (_utc_now(), user_id),
        )
        await self._db.commit()
        async with self._db.execute(
            "SELECT tailor_count_month FROM users WHERE id = ?", (user_id,)
        ) as cur:
            row = await cur.fetchone()
        return int(row["tailor_count_month"]) if row else 0

    # ── Settings ─────────────────────────────────────────────────────────
    async def get_setting(self, key: str) -> str | None:
        assert self._db is not None
        async with self._db.execute(
            "SELECT value FROM settings WHERE key = ?", (key,)
        ) as cur:
            row = await cur.fetchone()
        return row["value"] if row else None

    async def set_setting(self, key: str, value: str) -> None:
        assert self._db is not None
        await self._db.execute(
            """
            INSERT INTO settings (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
            """,
            (key, value, _utc_now()),
        )
        await self._db.commit()

    # ── Jobs ─────────────────────────────────────────────────────────────
    async def upsert_job(self, job: dict[str, Any]) -> str:
        assert self._db is not None
        import json as _json

        now = _utc_now()
        # Default 30-day TTL per PRD §14 Phase 2
        expires_at = job.get("expires_at") or _add_days(now, 30)
        tech_stack = job.get("tech_stack") or []
        tech_stack_json = _json.dumps(tech_stack) if isinstance(tech_stack, list) else str(tech_stack)

        await self._db.execute(
            """
            INSERT INTO jobs (
                id, job_hash, title, company, location, remote_type, field, level,
                tech_stack, jd_raw, apply_url, posted_date, source, quality_score,
                salary_min, salary_max, active, expires_at, created_at, updated_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)
            ON CONFLICT(job_hash) DO UPDATE SET
                title         = excluded.title,
                company       = excluded.company,
                location      = excluded.location,
                remote_type   = excluded.remote_type,
                field         = excluded.field,
                level         = excluded.level,
                tech_stack    = excluded.tech_stack,
                jd_raw        = excluded.jd_raw,
                apply_url     = excluded.apply_url,
                posted_date   = excluded.posted_date,
                source        = excluded.source,
                quality_score = excluded.quality_score,
                salary_min    = excluded.salary_min,
                salary_max    = excluded.salary_max,
                active        = 1,
                expires_at    = excluded.expires_at,
                updated_at    = excluded.updated_at
            """,
            (
                job["id"],
                job["job_hash"],
                job["title"],
                job["company"],
                job.get("location"),
                job.get("remote_type"),
                job.get("field"),
                job.get("level"),
                tech_stack_json,
                job.get("jd_raw"),
                job.get("apply_url"),
                job.get("posted_date"),
                job.get("source"),
                job.get("quality_score"),
                job.get("salary_min"),
                job.get("salary_max"),
                expires_at,
                now,
                now,
            ),
        )
        await self._db.commit()
        return job["id"]

    async def get_job(self, job_id: str) -> dict[str, Any] | None:
        assert self._db is not None
        async with self._db.execute(
            "SELECT * FROM jobs WHERE id = ? AND active = 1", (job_id,)
        ) as cur:
            row = await cur.fetchone()
        if row is None:
            return None
        return _row_to_job(dict(row))

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
        assert self._db is not None
        page = max(1, page)
        page_size = max(1, min(100, page_size))
        offset = (page - 1) * page_size

        where = ["active = 1"]
        params: list[Any] = []
        if field:
            where.append("field = ?")
            params.append(field)
        if level:
            where.append("level = ?")
            params.append(level)
        if remote_type:
            where.append("remote_type = ?")
            params.append(remote_type)
        if salary_min is not None:
            where.append("salary_max >= ?")
            params.append(salary_min)
        if quality_min is not None:
            where.append("quality_score >= ?")
            params.append(quality_min)
        where_sql = " AND ".join(where)

        # Total
        async with self._db.execute(
            f"SELECT COUNT(*) AS c FROM jobs WHERE {where_sql}", params
        ) as cur:
            row = await cur.fetchone()
        total = int(row["c"]) if row else 0

        # Page
        async with self._db.execute(
            f"""
            SELECT * FROM jobs
            WHERE {where_sql}
            ORDER BY quality_score DESC NULLS LAST, posted_date DESC
            LIMIT ? OFFSET ?
            """,
            (*params, page_size, offset),
        ) as cur:
            rows = await cur.fetchall()

        return {
            "items": [_row_to_job(dict(r)) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    async def count_jobs_by_field(self) -> dict[str, int]:
        assert self._db is not None
        async with self._db.execute(
            "SELECT field, COUNT(*) AS c FROM jobs WHERE active = 1 AND field IS NOT NULL GROUP BY field"
        ) as cur:
            rows = await cur.fetchall()
        return {r["field"]: int(r["c"]) for r in rows}

    async def mark_expired_jobs(self) -> int:
        assert self._db is not None
        cur = await self._db.execute(
            "UPDATE jobs SET active = 0 WHERE active = 1 AND expires_at < ?",
            (_utc_now(),),
        )
        await self._db.commit()
        return cur.rowcount or 0

    # ══════════════════════════════════════════════════════════════════════
    # Phase 3 — Resume + Tracker
    # ══════════════════════════════════════════════════════════════════════

    # ── Master resumes ───────────────────────────────────────────────────
    async def upsert_master_resume(self, resume: dict[str, Any]) -> str:
        assert self._db is not None
        import json as _json
        import uuid

        rid = resume.get("id") or f"mr_{uuid.uuid4().hex[:16]}"
        now = _utc_now()

        def _j(v):
            return _json.dumps(v) if v is not None else None

        await self._db.execute(
            """
            INSERT INTO master_resumes (
                id, user_id, contact_info, summary, experience, education, skills,
                projects, certifications, pdf_path, source, parse_method,
                raw_filename, created_at, updated_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                rid,
                resume["user_id"],
                _j(resume.get("contact_info")),
                resume.get("summary"),
                _j(resume.get("experience") or []),
                _j(resume.get("education") or []),
                _j(resume.get("skills") or []),
                _j(resume.get("projects") or []),
                _j(resume.get("certifications") or []),
                resume.get("pdf_path"),
                resume.get("source", "app"),
                resume.get("parse_method"),
                resume.get("raw_filename"),
                now, now,
            ),
        )
        await self._db.commit()
        return rid

    async def get_active_master_resume(self, user_id: str) -> dict[str, Any] | None:
        assert self._db is not None
        async with self._db.execute(
            "SELECT * FROM master_resumes WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
            (user_id,),
        ) as cur:
            row = await cur.fetchone()
        return _row_to_resume(dict(row)) if row else None

    async def get_master_resume(self, resume_id: str, user_id: str) -> dict[str, Any] | None:
        assert self._db is not None
        async with self._db.execute(
            "SELECT * FROM master_resumes WHERE id = ? AND user_id = ?",
            (resume_id, user_id),
        ) as cur:
            row = await cur.fetchone()
        return _row_to_resume(dict(row)) if row else None

    # ── Applications ─────────────────────────────────────────────────────
    async def create_application(self, app: dict[str, Any]) -> str:
        assert self._db is not None
        import json as _json
        import uuid

        aid = app.get("id") or f"app_{uuid.uuid4().hex[:16]}"
        now = _utc_now()
        status = app.get("status", "saved")
        history = [{"status": status, "changed_at": now, "note": "created"}]

        await self._db.execute(
            """
            INSERT INTO applications (
                id, user_id, job_id, tailored_resume_id, title, company, platform,
                status, status_history, starred, applied_at, follow_up_date,
                follow_up_notified, notes, created_at, updated_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?)
            """,
            (
                aid,
                app["user_id"],
                app.get("job_id"),
                app.get("tailored_resume_id"),
                app["title"],
                app["company"],
                app.get("platform"),
                status,
                _json.dumps(history),
                1 if app.get("starred") else 0,
                app.get("applied_at"),
                app.get("follow_up_date"),
                app.get("notes"),
                now, now,
            ),
        )
        await self._db.commit()
        return aid

    async def get_application(self, application_id: str, user_id: str) -> dict[str, Any] | None:
        assert self._db is not None
        async with self._db.execute(
            "SELECT * FROM applications WHERE id = ? AND user_id = ?",
            (application_id, user_id),
        ) as cur:
            row = await cur.fetchone()
        return _row_to_application(dict(row)) if row else None

    async def list_applications(
        self,
        user_id: str,
        *,
        status: str | None = None,
        starred: bool | None = None,
    ) -> list[dict[str, Any]]:
        assert self._db is not None
        where = ["user_id = ?"]
        params: list[Any] = [user_id]
        if status:
            where.append("status = ?")
            params.append(status)
        if starred is not None:
            where.append("starred = ?")
            params.append(1 if starred else 0)

        async with self._db.execute(
            f"SELECT * FROM applications WHERE {' AND '.join(where)} ORDER BY updated_at DESC",
            params,
        ) as cur:
            rows = await cur.fetchall()
        return [_row_to_application(dict(r)) for r in rows]

    async def update_application(
        self,
        application_id: str,
        user_id: str,
        patch: dict[str, Any],
    ) -> dict[str, Any] | None:
        assert self._db is not None
        import json as _json

        existing = await self.get_application(application_id, user_id)
        if existing is None:
            return None

        now = _utc_now()
        sets: list[str] = []
        params: list[Any] = []

        # Status change → append to status_history
        if "status" in patch and patch["status"] != existing["status"]:
            history = existing.get("status_history") or []
            history.append({
                "status": patch["status"],
                "changed_at": now,
                "note": patch.get("status_note", ""),
            })
            sets.append("status = ?")
            params.append(patch["status"])
            sets.append("status_history = ?")
            params.append(_json.dumps(history))
            # Convenience: setting status=applied stamps applied_at
            if patch["status"] == "applied" and not existing.get("applied_at"):
                sets.append("applied_at = ?")
                params.append(now)

        for col in ("title", "company", "platform", "notes", "follow_up_date",
                    "applied_at", "tailored_resume_id"):
            if col in patch:
                sets.append(f"{col} = ?")
                params.append(patch[col])

        if "starred" in patch:
            sets.append("starred = ?")
            params.append(1 if patch["starred"] else 0)
        if "follow_up_notified" in patch:
            sets.append("follow_up_notified = ?")
            params.append(1 if patch["follow_up_notified"] else 0)

        if not sets:
            return existing  # no-op patch

        sets.append("updated_at = ?")
        params.append(now)
        params.extend([application_id, user_id])

        await self._db.execute(
            f"UPDATE applications SET {', '.join(sets)} WHERE id = ? AND user_id = ?",
            params,
        )
        await self._db.commit()
        return await self.get_application(application_id, user_id)

    async def delete_application(self, application_id: str, user_id: str) -> bool:
        assert self._db is not None
        cur = await self._db.execute(
            "DELETE FROM applications WHERE id = ? AND user_id = ?",
            (application_id, user_id),
        )
        await self._db.commit()
        return (cur.rowcount or 0) > 0

    async def count_active_applications(self, user_id: str) -> int:
        assert self._db is not None
        async with self._db.execute(
            """
            SELECT COUNT(*) AS c FROM applications
            WHERE user_id = ? AND status NOT IN ('rejected', 'accepted')
            """,
            (user_id,),
        ) as cur:
            row = await cur.fetchone()
        return int(row["c"]) if row else 0

    # ── Recruiter contacts ───────────────────────────────────────────────
    async def add_recruiter_contact(self, contact: dict[str, Any]) -> str:
        assert self._db is not None
        import uuid
        cid = contact.get("id") or f"rc_{uuid.uuid4().hex[:16]}"
        await self._db.execute(
            """
            INSERT INTO recruiter_contacts (id, application_id, name, role, email, phone, linkedin_url, notes)
            VALUES (?,?,?,?,?,?,?,?)
            """,
            (
                cid, contact["application_id"], contact["name"], contact.get("role"),
                contact.get("email"), contact.get("phone"), contact.get("linkedin_url"),
                contact.get("notes"),
            ),
        )
        await self._db.commit()
        return cid

    async def list_recruiter_contacts(self, application_id: str) -> list[dict[str, Any]]:
        assert self._db is not None
        async with self._db.execute(
            "SELECT * FROM recruiter_contacts WHERE application_id = ? ORDER BY created_at DESC",
            (application_id,),
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    # ── Interviews ───────────────────────────────────────────────────────
    async def add_interview(self, interview: dict[str, Any]) -> str:
        assert self._db is not None
        import json as _json
        import uuid
        iid = interview.get("id") or f"iv_{uuid.uuid4().hex[:16]}"
        await self._db.execute(
            """
            INSERT INTO interviews (id, application_id, round, scheduled_at, duration_min,
                                    interviewer_names, location, notes, outcome)
            VALUES (?,?,?,?,?,?,?,?,?)
            """,
            (
                iid, interview["application_id"], interview["round"],
                interview.get("scheduled_at"), interview.get("duration_min"),
                _json.dumps(interview.get("interviewer_names") or []),
                interview.get("location"), interview.get("notes"),
                interview.get("outcome", "pending"),
            ),
        )
        await self._db.commit()
        return iid

    async def list_interviews(self, application_id: str) -> list[dict[str, Any]]:
        assert self._db is not None
        import json as _json
        async with self._db.execute(
            "SELECT * FROM interviews WHERE application_id = ? ORDER BY scheduled_at ASC",
            (application_id,),
        ) as cur:
            rows = await cur.fetchall()
        out = []
        for r in rows:
            d = dict(r)
            try:
                d["interviewer_names"] = _json.loads(d.get("interviewer_names") or "[]")
            except (ValueError, TypeError):
                d["interviewer_names"] = []
            out.append(d)
        return out

    async def update_interview(
        self, interview_id: str, application_id: str, patch: dict[str, Any]
    ) -> dict[str, Any] | None:
        assert self._db is not None
        import json as _json

        sets: list[str] = []
        params: list[Any] = []
        for col in ("round", "scheduled_at", "duration_min", "location", "notes", "outcome"):
            if col in patch:
                sets.append(f"{col} = ?")
                params.append(patch[col])
        if "interviewer_names" in patch:
            sets.append("interviewer_names = ?")
            params.append(_json.dumps(patch["interviewer_names"]))
        if not sets:
            return None
        params.extend([interview_id, application_id])
        await self._db.execute(
            f"UPDATE interviews SET {', '.join(sets)} WHERE id = ? AND application_id = ?",
            params,
        )
        await self._db.commit()
        rows = await self.list_interviews(application_id)
        return next((iv for iv in rows if iv["id"] == interview_id), None)

    # ── Salary details ───────────────────────────────────────────────────
    async def add_salary_details(self, salary: dict[str, Any]) -> str:
        assert self._db is not None
        import uuid
        sid = salary.get("id") or f"sd_{uuid.uuid4().hex[:16]}"
        await self._db.execute(
            """
            INSERT INTO salary_details (id, application_id, base_min, base_max, bonus,
                                        equity_value, equity_vesting, currency, notes)
            VALUES (?,?,?,?,?,?,?,?,?)
            """,
            (
                sid, salary["application_id"],
                salary.get("base_min"), salary.get("base_max"),
                salary.get("bonus"), salary.get("equity_value"),
                salary.get("equity_vesting"), salary.get("currency", "USD"),
                salary.get("notes"),
            ),
        )
        await self._db.commit()
        return sid

    async def list_salary_details(self, application_id: str) -> list[dict[str, Any]]:
        assert self._db is not None
        async with self._db.execute(
            "SELECT * FROM salary_details WHERE application_id = ? ORDER BY created_at DESC",
            (application_id,),
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]


    # ══════════════════════════════════════════════════════════════════════
    # Phase 5 — Tailor
    # ══════════════════════════════════════════════════════════════════════
    async def save_tailored_resume(self, tailored: dict[str, Any]) -> str:
        assert self._db is not None
        import json as _json
        import uuid

        tid = tailored.get("id") or f"tr_{uuid.uuid4().hex[:16]}"
        await self._db.execute(
            """
            INSERT INTO tailored_resumes (
                id, user_id, job_id, master_resume_id, content_markdown,
                ats_score, match_points, gaps, keywords_added,
                pdf_path, source, sonnet_method, created_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                tid,
                tailored["user_id"],
                tailored.get("job_id"),
                tailored["master_resume_id"],
                tailored.get("content_markdown"),
                tailored.get("ats_score"),
                _json.dumps(tailored.get("match_points") or []),
                _json.dumps(tailored.get("gaps") or []),
                _json.dumps(tailored.get("keywords_added") or []),
                tailored.get("pdf_path"),
                tailored.get("source", "app"),
                tailored.get("sonnet_method"),
                _utc_now(),
            ),
        )
        await self._db.commit()
        return tid

    async def get_tailored_resume(
        self, tailored_id: str, user_id: str
    ) -> dict[str, Any] | None:
        assert self._db is not None
        async with self._db.execute(
            "SELECT * FROM tailored_resumes WHERE id = ? AND user_id = ?",
            (tailored_id, user_id),
        ) as cur:
            row = await cur.fetchone()
        return _row_to_tailored(dict(row)) if row else None

    async def list_tailored_resumes(
        self, user_id: str, *, job_id: str | None = None, limit: int = 50
    ) -> list[dict[str, Any]]:
        assert self._db is not None
        if job_id:
            sql = "SELECT * FROM tailored_resumes WHERE user_id = ? AND job_id = ? ORDER BY created_at DESC LIMIT ?"
            params: tuple = (user_id, job_id, limit)
        else:
            sql = "SELECT * FROM tailored_resumes WHERE user_id = ? ORDER BY created_at DESC LIMIT ?"
            params = (user_id, limit)
        async with self._db.execute(sql, params) as cur:
            rows = await cur.fetchall()
        return [_row_to_tailored(dict(r)) for r in rows]

    async def reset_tailor_count_if_due(self, user_id: str) -> int:
        assert self._db is not None
        from datetime import datetime as _dt, timezone as _tz

        async with self._db.execute(
            "SELECT tailor_count_month, tailor_count_reset_at FROM users WHERE id = ?",
            (user_id,),
        ) as cur:
            row = await cur.fetchone()
        if row is None:
            return 0
        count = int(row["tailor_count_month"])
        reset_at = row["tailor_count_reset_at"]

        now = _dt.now(_tz.utc)

        # First time — set reset window to start of next month
        if not reset_at:
            next_reset = _next_month_start(now)
            await self._db.execute(
                "UPDATE users SET tailor_count_reset_at = ? WHERE id = ?",
                (next_reset.strftime("%Y-%m-%dT%H:%M:%S.%fZ")[:-4] + "Z", user_id),
            )
            await self._db.commit()
            return count

        # Window elapsed → reset
        try:
            reset_dt = _dt.fromisoformat(reset_at.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            reset_dt = now  # malformed — force reset
        if now >= reset_dt:
            next_reset = _next_month_start(now)
            await self._db.execute(
                """
                UPDATE users
                SET tailor_count_month = 0,
                    tailor_count_reset_at = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    next_reset.strftime("%Y-%m-%dT%H:%M:%S.%fZ")[:-4] + "Z",
                    _utc_now(),
                    user_id,
                ),
            )
            await self._db.commit()
            return 0
        return count

    # ══════════════════════════════════════════════════════════════════════
    # Phase 8 — Cover letters + interview prep
    # ══════════════════════════════════════════════════════════════════════
    async def save_cover_letter(self, cover: dict[str, Any]) -> str:
        assert self._db is not None
        import uuid
        cid = cover.get("id") or f"cl_{uuid.uuid4().hex[:16]}"
        await self._db.execute(
            """
            INSERT INTO cover_letters (
                id, user_id, job_id, tailored_resume_id, content_markdown,
                tone, pdf_path, sonnet_method, tokens_in, tokens_out, created_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                cid,
                cover["user_id"],
                cover["job_id"],
                cover.get("tailored_resume_id"),
                cover["content_markdown"],
                cover.get("tone", "professional"),
                cover.get("pdf_path"),
                cover.get("sonnet_method"),
                int(cover.get("tokens_in") or 0),
                int(cover.get("tokens_out") or 0),
                _utc_now(),
            ),
        )
        await self._db.commit()
        return cid

    async def get_cover_letter(
        self, cover_id: str, user_id: str
    ) -> dict[str, Any] | None:
        assert self._db is not None
        async with self._db.execute(
            "SELECT * FROM cover_letters WHERE id = ? AND user_id = ?",
            (cover_id, user_id),
        ) as cur:
            row = await cur.fetchone()
        return dict(row) if row else None

    async def list_cover_letters(
        self, user_id: str, *, job_id: str | None = None, limit: int = 50
    ) -> list[dict[str, Any]]:
        assert self._db is not None
        if job_id:
            sql = ("SELECT * FROM cover_letters WHERE user_id = ? AND job_id = ? "
                   "ORDER BY created_at DESC LIMIT ?")
            params: tuple = (user_id, job_id, limit)
        else:
            sql = ("SELECT * FROM cover_letters WHERE user_id = ? "
                   "ORDER BY created_at DESC LIMIT ?")
            params = (user_id, limit)
        async with self._db.execute(sql, params) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    async def save_interview_prep(self, prep: dict[str, Any]) -> str:
        assert self._db is not None
        import json as _json
        import uuid
        pid = prep.get("id") or f"ip_{uuid.uuid4().hex[:16]}"
        await self._db.execute(
            """
            INSERT INTO interview_prep (
                id, user_id, job_id, questions, strengths, gaps_to_address,
                talking_points, haiku_method, tokens_in, tokens_out, created_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                pid,
                prep["user_id"],
                prep["job_id"],
                _json.dumps(prep.get("questions") or []),
                _json.dumps(prep.get("strengths") or []),
                _json.dumps(prep.get("gaps_to_address") or []),
                _json.dumps(prep.get("talking_points") or []),
                prep.get("haiku_method"),
                int(prep.get("tokens_in") or 0),
                int(prep.get("tokens_out") or 0),
                _utc_now(),
            ),
        )
        await self._db.commit()
        return pid

    async def get_interview_prep(
        self, prep_id: str, user_id: str
    ) -> dict[str, Any] | None:
        assert self._db is not None
        async with self._db.execute(
            "SELECT * FROM interview_prep WHERE id = ? AND user_id = ?",
            (prep_id, user_id),
        ) as cur:
            row = await cur.fetchone()
        return _row_to_prep(dict(row)) if row else None

    async def get_latest_interview_prep_for_job(
        self, user_id: str, job_id: str
    ) -> dict[str, Any] | None:
        assert self._db is not None
        async with self._db.execute(
            """
            SELECT * FROM interview_prep
            WHERE user_id = ? AND job_id = ?
            ORDER BY created_at DESC LIMIT 1
            """,
            (user_id, job_id),
        ) as cur:
            row = await cur.fetchone()
        return _row_to_prep(dict(row)) if row else None

    async def list_interview_prep(
        self, user_id: str, *, job_id: str | None = None, limit: int = 50
    ) -> list[dict[str, Any]]:
        assert self._db is not None
        if job_id:
            sql = ("SELECT * FROM interview_prep WHERE user_id = ? AND job_id = ? "
                   "ORDER BY created_at DESC LIMIT ?")
            params: tuple = (user_id, job_id, limit)
        else:
            sql = ("SELECT * FROM interview_prep WHERE user_id = ? "
                   "ORDER BY created_at DESC LIMIT ?")
            params = (user_id, limit)
        async with self._db.execute(sql, params) as cur:
            rows = await cur.fetchall()
        return [_row_to_prep(dict(r)) for r in rows]

    # ══════════════════════════════════════════════════════════════════════
    # Phase 6 — Notifications
    # ══════════════════════════════════════════════════════════════════════
    async def upsert_push_token(
        self,
        user_id: str,
        expo_token: str,
        *,
        platform: str | None = None,
        device_name: str | None = None,
    ) -> str:
        assert self._db is not None
        import uuid

        # Token is unique; SQLite ON CONFLICT updates the existing row.
        async with self._db.execute(
            "SELECT id FROM push_tokens WHERE expo_token = ?", (expo_token,),
        ) as cur:
            existing = await cur.fetchone()

        now = _utc_now()
        if existing:
            tok_id = existing["id"]
            await self._db.execute(
                """
                UPDATE push_tokens
                SET user_id = ?, platform = COALESCE(?, platform),
                    device_name = COALESCE(?, device_name),
                    enabled = 1, last_seen_at = ?, last_error = NULL
                WHERE id = ?
                """,
                (user_id, platform, device_name, now, tok_id),
            )
        else:
            tok_id = f"pt_{uuid.uuid4().hex[:16]}"
            await self._db.execute(
                """
                INSERT INTO push_tokens
                    (id, user_id, expo_token, platform, device_name, enabled, last_seen_at)
                VALUES (?, ?, ?, ?, ?, 1, ?)
                """,
                (tok_id, user_id, expo_token, platform, device_name, now),
            )
        await self._db.commit()
        return tok_id

    async def list_push_tokens(self, user_id: str, *, enabled_only: bool = True) -> list[dict[str, Any]]:
        assert self._db is not None
        sql = "SELECT * FROM push_tokens WHERE user_id = ?"
        if enabled_only:
            sql += " AND enabled = 1"
        sql += " ORDER BY last_seen_at DESC NULLS LAST"
        async with self._db.execute(sql, (user_id,)) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    async def disable_push_token(self, expo_token: str, *, error: str | None = None) -> bool:
        assert self._db is not None
        cur = await self._db.execute(
            "UPDATE push_tokens SET enabled = 0, last_error = ? WHERE expo_token = ?",
            (error, expo_token),
        )
        await self._db.commit()
        return (cur.rowcount or 0) > 0

    async def get_notification_preferences(self, user_id: str) -> dict[str, Any]:
        assert self._db is not None
        async with self._db.execute(
            "SELECT * FROM notification_preferences WHERE user_id = ?", (user_id,),
        ) as cur:
            row = await cur.fetchone()
        if row:
            prefs = dict(row)
            # Back-fill unsubscribe_token if missing (e.g. row pre-dates migration)
            if not prefs.get("unsubscribe_token"):
                import secrets as _sec
                tok = _sec.token_urlsafe(32)
                await self._db.execute(
                    "UPDATE notification_preferences SET unsubscribe_token = ? WHERE user_id = ?",
                    (tok, user_id),
                )
                await self._db.commit()
                prefs["unsubscribe_token"] = tok
            return _row_to_prefs(prefs)

        # Lazy-create default with a fresh token
        import secrets as _sec
        tok = _sec.token_urlsafe(32)
        await self._db.execute(
            "INSERT INTO notification_preferences (user_id, unsubscribe_token) VALUES (?, ?)",
            (user_id, tok),
        )
        await self._db.commit()
        async with self._db.execute(
            "SELECT * FROM notification_preferences WHERE user_id = ?", (user_id,),
        ) as cur:
            row = await cur.fetchone()
        assert row is not None
        return _row_to_prefs(dict(row))

    async def update_notification_preferences(
        self, user_id: str, patch: dict[str, Any],
    ) -> dict[str, Any]:
        assert self._db is not None
        # Ensure row exists
        await self.get_notification_preferences(user_id)

        sets: list[str] = []
        params: list[Any] = []
        for col in ("digest_enabled", "push_enabled", "digest_count",
                    "digest_hour_utc", "timezone"):
            if col in patch:
                v = patch[col]
                if col in ("digest_enabled", "push_enabled"):
                    v = 1 if v else 0
                sets.append(f"{col} = ?")
                params.append(v)
        if not sets:
            return await self.get_notification_preferences(user_id)
        sets.append("updated_at = ?")
        params.append(_utc_now())
        params.append(user_id)
        await self._db.execute(
            f"UPDATE notification_preferences SET {', '.join(sets)} WHERE user_id = ?",
            params,
        )
        await self._db.commit()
        return await self.get_notification_preferences(user_id)

    async def list_users_for_digest(self, digest_hour_utc: int) -> list[dict[str, Any]]:
        assert self._db is not None
        # User must have email + opted-in digest + matching hour. Defaults to enabled=1.
        async with self._db.execute(
            """
            SELECT u.id, u.email, u.plan,
                   COALESCE(np.digest_count, 5)     AS digest_count,
                   COALESCE(np.digest_hour_utc, 6)  AS digest_hour_utc
            FROM users u
            LEFT JOIN notification_preferences np ON np.user_id = u.id
            WHERE u.email IS NOT NULL
              AND u.email != ''
              AND COALESCE(np.digest_enabled, 1) = 1
              AND COALESCE(np.digest_hour_utc, 6) = ?
            """,
            (digest_hour_utc,),
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    async def log_email_digest(
        self, user_id: str, *, subject: str, job_ids: list[str], resend_id: str | None,
    ) -> str:
        assert self._db is not None
        import json as _json, uuid
        log_id = f"ed_{uuid.uuid4().hex[:16]}"
        await self._db.execute(
            """
            INSERT INTO email_digest_log
                (id, user_id, subject, job_ids, resend_id)
            VALUES (?, ?, ?, ?, ?)
            """,
            (log_id, user_id, subject, _json.dumps(job_ids), resend_id),
        )
        await self._db.commit()
        return log_id

    async def get_notification_prefs_by_unsubscribe_token(
        self, token: str,
    ) -> dict[str, Any] | None:
        assert self._db is not None
        async with self._db.execute(
            "SELECT * FROM notification_preferences WHERE unsubscribe_token = ?",
            (token,),
        ) as cur:
            row = await cur.fetchone()
        return dict(row) if row else None

    async def update_digest_log_event(
        self, resend_id: str, *, event_type: str,
    ) -> None:
        assert self._db is not None
        now = _utc_now()
        if event_type == "opened":
            await self._db.execute(
                "UPDATE email_digest_log SET opened_at = ? WHERE resend_id = ? AND opened_at IS NULL",
                (now, resend_id),
            )
        elif event_type == "clicked":
            await self._db.execute(
                "UPDATE email_digest_log SET clicked_at = ? WHERE resend_id = ?",
                (now, resend_id),
            )
        # bounced: no column update needed — caller can log/alert separately
        await self._db.commit()

    async def log_push_notification(
        self,
        user_id: str,
        *,
        kind: str,
        title: str,
        body: str,
        application_id: str | None = None,
    ) -> str:
        assert self._db is not None
        import uuid
        log_id = f"pn_{uuid.uuid4().hex[:16]}"
        await self._db.execute(
            """
            INSERT INTO push_notifications
                (id, user_id, kind, title, body, application_id)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (log_id, user_id, kind, title, body, application_id),
        )
        await self._db.commit()
        return log_id

    async def applications_with_due_follow_ups(self) -> list[dict[str, Any]]:
        assert self._db is not None
        now = _utc_now()
        async with self._db.execute(
            """
            SELECT a.*, u.email, u.id AS uid
            FROM applications a
            JOIN users u ON u.id = a.user_id
            WHERE a.follow_up_date IS NOT NULL
              AND a.follow_up_date <= ?
              AND a.follow_up_notified = 0
              AND a.status NOT IN ('rejected', 'accepted')
            """,
            (now,),
        ) as cur:
            rows = await cur.fetchall()
        return [_row_to_application(dict(r)) | {"email": r["email"]} for r in rows]

    async def applications_with_upcoming_interviews(self, *, hours_ahead: int = 24) -> list[dict[str, Any]]:
        assert self._db is not None
        from datetime import datetime, timedelta, timezone

        now_dt = datetime.now(timezone.utc)
        cutoff = (now_dt + timedelta(hours=hours_ahead)).strftime("%Y-%m-%dT%H:%M:%S.%fZ")[:-4] + "Z"
        now_str = _utc_now()

        async with self._db.execute(
            """
            SELECT a.*, i.id AS interview_id, i.round, i.scheduled_at, i.location,
                   u.email
            FROM interviews i
            JOIN applications a ON a.id = i.application_id
            JOIN users u ON u.id = a.user_id
            WHERE i.scheduled_at IS NOT NULL
              AND i.scheduled_at >= ?
              AND i.scheduled_at <= ?
              AND COALESCE(i.outcome, 'pending') = 'pending'
            ORDER BY i.scheduled_at ASC
            """,
            (now_str, cutoff),
        ) as cur:
            rows = await cur.fetchall()
        out: list[dict[str, Any]] = []
        for r in rows:
            d = _row_to_application(dict(r))
            d["interview_id"] = r["interview_id"]
            d["interview_round"] = r["round"]
            d["interview_scheduled_at"] = r["scheduled_at"]
            d["interview_location"] = r["location"]
            d["email"] = r["email"]
            out.append(d)
        return out

    async def stale_applications(self, *, days: int = 14) -> list[dict[str, Any]]:
        assert self._db is not None
        from datetime import datetime, timedelta, timezone
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%S.%fZ")[:-4] + "Z"
        async with self._db.execute(
            """
            SELECT a.*, u.email
            FROM applications a
            JOIN users u ON u.id = a.user_id
            WHERE a.updated_at < ?
              AND a.status IN ('applied', 'phone_screen', 'technical', 'onsite')
            """,
            (cutoff,),
        ) as cur:
            rows = await cur.fetchall()
        return [_row_to_application(dict(r)) | {"email": r["email"]} for r in rows]

    async def jobs_for_user_digest(
        self,
        user_id: str,
        *,
        limit: int = 5,
        since_hours: int = 24,
    ) -> list[dict[str, Any]]:
        assert self._db is not None
        from datetime import datetime, timedelta, timezone
        since = (datetime.now(timezone.utc) - timedelta(hours=since_hours)).strftime("%Y-%m-%dT%H:%M:%S.%fZ")[:-4] + "Z"

        # Pull recent active jobs the user hasn't already saved/applied to.
        # `created_at` is when WE first saw the job; `posted_date` is the
        # job's own publish time. Use `created_at` for "freshness in our feed".
        async with self._db.execute(
            """
            SELECT j.*
            FROM jobs j
            WHERE j.active = 1
              AND j.created_at >= ?
              AND j.id NOT IN (
                  SELECT job_id FROM applications
                  WHERE user_id = ? AND job_id IS NOT NULL
              )
            ORDER BY COALESCE(j.quality_score, 0) DESC, j.posted_date DESC, j.created_at DESC
            LIMIT ?
            """,
            (since, user_id, limit),
        ) as cur:
            rows = await cur.fetchall()
        return [_row_to_job(dict(r)) for r in rows]

    # ══════════════════════════════════════════════════════════════════
    # Phase 8 — Analytics
    # ══════════════════════════════════════════════════════════════════
    async def list_applications_since(
        self, user_id: str, *, since_iso: str
    ) -> list[dict[str, Any]]:
        assert self._db is not None
        async with self._db.execute(
            """
            SELECT * FROM applications
            WHERE user_id = ? AND created_at >= ?
            ORDER BY created_at DESC
            """,
            (user_id, since_iso),
        ) as cur:
            rows = await cur.fetchall()
        return [_row_to_application(dict(r)) for r in rows]

    async def tailored_resumes_by_ids(
        self, user_id: str, ids: list[str]
    ) -> list[dict[str, Any]]:
        assert self._db is not None
        if not ids:
            return []
        # Defensive RLS sim: scope to user_id even with ids.
        placeholders = ",".join("?" * len(ids))
        sql = (
            f"SELECT id, ats_score, source, created_at, job_id "
            f"FROM tailored_resumes WHERE user_id = ? AND id IN ({placeholders})"
        )
        async with self._db.execute(sql, [user_id, *ids]) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    async def digest_log_since(
        self, user_id: str, *, since_iso: str
    ) -> list[dict[str, Any]]:
        assert self._db is not None
        import json as _json
        async with self._db.execute(
            """
            SELECT id, sent_at, opened_at, clicked_at, subject, job_ids, resend_id
            FROM email_digest_log
            WHERE user_id = ? AND sent_at >= ?
            ORDER BY sent_at DESC
            """,
            (user_id, since_iso),
        ) as cur:
            rows = await cur.fetchall()
        out: list[dict[str, Any]] = []
        for r in rows:
            d = dict(r)
            try:
                d["job_ids"] = _json.loads(d.get("job_ids") or "[]")
            except Exception:
                d["job_ids"] = []
            out.append(d)
        return out

    async def count_tailored_resumes_since(
        self, user_id: str, *, since_iso: str, source: str | None = None
    ) -> int:
        assert self._db is not None
        if source is None:
            sql = (
                "SELECT COUNT(*) AS n FROM tailored_resumes "
                "WHERE user_id = ? AND created_at >= ?"
            )
            params: tuple[Any, ...] = (user_id, since_iso)
        else:
            sql = (
                "SELECT COUNT(*) AS n FROM tailored_resumes "
                "WHERE user_id = ? AND created_at >= ? AND source = ?"
            )
            params = (user_id, since_iso, source)
        async with self._db.execute(sql, params) as cur:
            row = await cur.fetchone()
        return int(row["n"]) if row else 0

    # ══════════════════════════════════════════════════════════════════
    # Phase 9 — Coach Tier
    # ══════════════════════════════════════════════════════════════════
    COACH_CLIENT_CAP = 10  # Coach plan = 10 clients per system prompt

    async def get_user_by_email(self, email: str) -> dict[str, Any] | None:
        assert self._db is not None
        async with self._db.execute(
            "SELECT * FROM users WHERE email = ? LIMIT 1", (email,)
        ) as cur:
            row = await cur.fetchone()
        return dict(row) if row else None

    async def add_coach_client(
        self,
        coach_id: str,
        *,
        invited_email: str,
        invited_name: str | None,
        invite_token: str,
    ) -> str:
        assert self._db is not None
        import uuid

        # 10-client cap (active only — pending invites don't count)
        n_active = await self.count_coach_clients(coach_id, status="active")
        if n_active >= self.COACH_CLIENT_CAP:
            raise ValueError(
                f"Coach client cap reached ({n_active}/{self.COACH_CLIENT_CAP})"
            )

        # Reject duplicate pending or active for same (coach, email)
        async with self._db.execute(
            """
            SELECT id, status FROM coach_clients
            WHERE coach_id = ? AND invited_email = ?
              AND status IN ('pending', 'active')
            LIMIT 1
            """,
            (coach_id, invited_email),
        ) as cur:
            existing = await cur.fetchone()
        if existing:
            raise ValueError(
                f"Already have a {existing['status']} invite for {invited_email}"
            )

        cid = f"cc_{uuid.uuid4().hex[:16]}"
        await self._db.execute(
            """
            INSERT INTO coach_clients
                (id, coach_id, invited_email, invited_name, invite_token, status)
            VALUES (?, ?, ?, ?, ?, 'pending')
            """,
            (cid, coach_id, invited_email, invited_name, invite_token),
        )
        await self._db.commit()
        return cid

    async def get_coach_client(
        self, coach_client_id: str, coach_id: str
    ) -> dict[str, Any] | None:
        assert self._db is not None
        async with self._db.execute(
            """
            SELECT cc.*, u.email AS client_email_actual
            FROM coach_clients cc
            LEFT JOIN users u ON u.id = cc.client_id
            WHERE cc.id = ? AND cc.coach_id = ?
            """,
            (coach_client_id, coach_id),
        ) as cur:
            row = await cur.fetchone()
        if row is None:
            return None
        d = dict(row)
        d["client_name_actual"] = None  # users table has no name column yet
        return d

    async def get_coach_client_by_token(
        self, invite_token: str
    ) -> dict[str, Any] | None:
        assert self._db is not None
        async with self._db.execute(
            "SELECT * FROM coach_clients WHERE invite_token = ? LIMIT 1",
            (invite_token,),
        ) as cur:
            row = await cur.fetchone()
        return dict(row) if row else None

    async def list_coach_clients(
        self, coach_id: str, *, status: str | None = None
    ) -> list[dict[str, Any]]:
        assert self._db is not None
        sql = (
            "SELECT cc.*, u.email AS client_email_actual "
            "FROM coach_clients cc LEFT JOIN users u ON u.id = cc.client_id "
            "WHERE cc.coach_id = ?"
        )
        params: list[Any] = [coach_id]
        if status:
            sql += " AND cc.status = ?"
            params.append(status)
        sql += " ORDER BY cc.invited_at DESC"
        async with self._db.execute(sql, params) as cur:
            rows = await cur.fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["client_name_actual"] = None
            out.append(d)
        return out

    async def count_coach_clients(
        self, coach_id: str, *, status: str = "active"
    ) -> int:
        assert self._db is not None
        async with self._db.execute(
            "SELECT COUNT(*) AS n FROM coach_clients "
            "WHERE coach_id = ? AND status = ?",
            (coach_id, status),
        ) as cur:
            row = await cur.fetchone()
        return int(row["n"]) if row else 0

    async def accept_coach_invite(
        self, invite_token: str, accepting_user_id: str
    ) -> dict[str, Any] | None:
        assert self._db is not None
        existing = await self.get_coach_client_by_token(invite_token)
        if existing is None or existing["status"] != "pending":
            return None
        if existing["coach_id"] == accepting_user_id:
            return None  # can't be your own client

        now = _utc_now()
        await self._db.execute(
            """
            UPDATE coach_clients
            SET status = 'active', client_id = ?, accepted_at = ?
            WHERE id = ?
            """,
            (accepting_user_id, now, existing["id"]),
        )
        await self._db.commit()
        return await self.get_coach_client(existing["id"], existing["coach_id"])

    async def remove_coach_client(
        self, coach_client_id: str, coach_id: str
    ) -> bool:
        assert self._db is not None
        cur = await self._db.execute(
            "DELETE FROM coach_clients WHERE id = ? AND coach_id = ?",
            (coach_client_id, coach_id),
        )
        await self._db.commit()
        return (cur.rowcount or 0) > 0

    async def update_coach_client(
        self, coach_client_id: str, coach_id: str, patch: dict[str, Any]
    ) -> dict[str, Any] | None:
        assert self._db is not None
        existing = await self.get_coach_client(coach_client_id, coach_id)
        if existing is None:
            return None

        sets: list[str] = []
        params: list[Any] = []
        for k in ("notes", "invited_name", "status"):
            if k in patch:
                sets.append(f"{k} = ?")
                params.append(patch[k])
        if not sets:
            return existing
        params.extend([coach_client_id, coach_id])
        await self._db.execute(
            f"UPDATE coach_clients SET {', '.join(sets)} WHERE id = ? AND coach_id = ?",
            params,
        )
        await self._db.commit()
        return await self.get_coach_client(coach_client_id, coach_id)

    async def update_coach_branding(
        self, coach_id: str, *, logo_path: str | None, brand_color: str | None
    ) -> dict[str, Any]:
        assert self._db is not None
        sets: list[str] = []
        params: list[Any] = []
        # Allow explicit None to clear; only skip the field if NOT in kwargs
        # Caller signals "leave alone" by passing existing value back in.
        sets.append("coach_logo_path = ?")
        params.append(logo_path)
        sets.append("coach_brand_color = ?")
        params.append(brand_color)
        sets.append("updated_at = ?")
        params.append(_utc_now())
        params.append(coach_id)
        await self._db.execute(
            f"UPDATE users SET {', '.join(sets)} WHERE id = ?",
            params,
        )
        await self._db.commit()
        async with self._db.execute(
            "SELECT id, email, plan, coach_logo_path, coach_brand_color FROM users WHERE id = ?",
            (coach_id,),
        ) as cur:
            row = await cur.fetchone()
        return dict(row) if row else {}

    async def get_coach_branding(self, coach_id: str) -> dict[str, Any] | None:
        assert self._db is not None
        async with self._db.execute(
            "SELECT coach_logo_path, coach_brand_color FROM users WHERE id = ?",
            (coach_id,),
        ) as cur:
            row = await cur.fetchone()
        return dict(row) if row else None

    # ── Phase 7: Billing ─────────────────────────────────────────────────
    async def update_user_billing(
        self,
        user_id: str,
        *,
        plan: str,
        ls_subscription_id: str,
        ls_customer_id: str,
        ls_variant_id: str,
        plan_renewal_at: str | None,
        plan_ends_at: str | None,
    ) -> dict[str, Any]:
        assert self._db is not None
        now = _utc_now()
        await self._db.execute(
            """UPDATE users SET
               plan = ?, ls_subscription_id = ?, ls_customer_id = ?,
               ls_variant_id = ?, plan_renewal_at = ?, plan_ends_at = ?,
               updated_at = ?
               WHERE id = ?""",
            (plan, ls_subscription_id, ls_customer_id,
             ls_variant_id, plan_renewal_at, plan_ends_at, now, user_id),
        )
        await self._db.commit()
        user = await self.get_user(user_id)
        assert user is not None
        return user

    async def get_user_by_ls_customer_id(
        self, ls_customer_id: str
    ) -> dict[str, Any] | None:
        assert self._db is not None
        async with self._db.execute(
            "SELECT * FROM users WHERE ls_customer_id = ?", (ls_customer_id,)
        ) as cur:
            row = await cur.fetchone()
        return dict(row) if row else None
