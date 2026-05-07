"""[AppName] FastAPI backend. Mode-aware via APPNAME_MODE env var.

Run locally (desktop mode, no signups needed):
    APPNAME_MODE=desktop uvicorn backend.main:app --reload

Run in SaaS mode (requires Supabase env vars):
    APPNAME_MODE=saas uvicorn backend.main:app --reload
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
import os

from backend import config
from backend.auth import require_user
from backend.storage import StorageAdapter, get_storage


# ── Pydantic strict bodies (per JustHireMe pattern) ──────────────────
class StrictBody(BaseModel):
    model_config = ConfigDict(extra="forbid")


class UserResponse(StrictBody):
    id: str
    email: str
    plan: str
    tailor_count_month: int
    field: str | None = None
    level: str | None = None
    location: str | None = None
    remote_pref: str | None = None


# ── Lifespan: connect/disconnect storage ─────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    storage = get_storage()
    await storage.connect()

    # In desktop mode, ensure the local user row exists so /api/me works.
    if config.is_desktop():
        await storage.upsert_user(
            user_id="local",
            email="local@desktop",
            plan="desktop",
        )
        # Print local API token to stdout — Tauri captures this on launch.
        print(f"\n[AppName] mode=desktop  api_token={config.LOCAL_API_TOKEN}\n", flush=True)

    yield
    await storage.disconnect()


app = FastAPI(
    title="[AppName] API",
    version="0.1.0-phase1",
    lifespan=lifespan,
)

# CORS — locked to local origins per JustHireMe pattern
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(tauri://localhost|https?://(localhost|127\.0\.0\.1|tauri\.localhost|\[::1\])(?::\d+)?)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def storage_dep() -> StorageAdapter:
    return get_storage()


# ── Public endpoints ────────────────────────────────────────────────
@app.get("/health")
async def health(storage: StorageAdapter = Depends(storage_dep)) -> dict[str, Any]:
    """Public health check. Returns adapter info — never user data."""
    return {
        "status": "ok",
        "mode": config.APPNAME_MODE,
        "storage": await storage.healthcheck(),
    }


# ── Authenticated endpoints ─────────────────────────────────────────
@app.get("/api/me", response_model=UserResponse)
async def get_me(
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
) -> UserResponse:
    user = await storage.get_user(user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")

    return UserResponse(
        id=user["id"],
        email=user["email"],
        plan=user["plan"],
        tailor_count_month=int(user["tailor_count_month"]),
        field=user.get("field"),
        level=user.get("level"),
        location=user.get("location"),
        remote_pref=user.get("remote_pref"),
    )


# ══════════════════════════════════════════════════════════════════════
# Phase 2 — Job Feed
# ══════════════════════════════════════════════════════════════════════
from typing import Literal
from fastapi import Header, Query
from backend.jobs.cache import job_feed_cache
from backend.jobs.pipeline import run_ingestion


class JobOut(BaseModel):
    # Response models — allow extras silently (DB rows have created_at etc.)
    model_config = ConfigDict(extra="ignore")

    id: str
    title: str
    company: str
    location: str | None = None
    remote_type: str | None = None
    field: str | None = None
    level: str | None = None
    tech_stack: list[str] = []
    apply_url: str | None = None
    posted_date: str | None = None
    quality_score: int | None = None
    salary_min: int | None = None
    salary_max: int | None = None


class JobListResponse(StrictBody):
    items: list[JobOut]
    total: int
    page: int
    page_size: int


class JobDetailResponse(JobOut):
    jd_raw: str | None = None
    source: str | None = None


class FieldCountsResponse(StrictBody):
    counts: dict[str, int]
    total: int


class IngestRequest(StrictBody):
    queries: list[str] = ["software engineer remote", "data engineer remote"]
    quality_threshold: int = 20  # spam-filter floor — see pipeline.py docstring


class IngestResponse(StrictBody):
    fetched: int
    gated: int
    tagged: int
    inserted: int
    skipped: int
    expired_marked: int


@app.get("/api/jobs", response_model=JobListResponse)
async def list_jobs(
    field: str | None = Query(default=None),
    level: str | None = Query(default=None),
    remote_type: Literal["remote", "onsite", "hybrid"] | None = Query(default=None),
    salary_min: int | None = Query(default=None, ge=0),
    quality_min: int | None = Query(default=None, ge=0, le=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    storage: StorageAdapter = Depends(storage_dep),
) -> JobListResponse:
    """Paginated public job feed. Cached for 1 hour, invalidated on each ingestion run."""
    cache_key = (
        f"jobs|f={field}|l={level}|r={remote_type}|s={salary_min}"
        f"|q={quality_min}|p={page}|ps={page_size}"
    )
    cached = job_feed_cache.get(cache_key)
    if cached is not None:
        return JobListResponse(**cached)

    result = await storage.list_jobs(
        field=field,
        level=level,
        remote_type=remote_type,
        salary_min=salary_min,
        quality_min=quality_min,
        page=page,
        page_size=page_size,
    )
    response = JobListResponse(
        items=[JobOut(**j) for j in result["items"]],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
    )
    job_feed_cache.set(cache_key, response.model_dump())
    return response


@app.get("/api/jobs/fields", response_model=FieldCountsResponse)
async def get_job_field_counts(
    storage: StorageAdapter = Depends(storage_dep),
) -> FieldCountsResponse:
    """Returns active job count per field. Powers filter UI badges."""
    counts = await storage.count_jobs_by_field()
    return FieldCountsResponse(counts=counts, total=sum(counts.values()))


@app.get("/api/jobs/{job_id}", response_model=JobDetailResponse)
async def get_job(
    job_id: str,
    storage: StorageAdapter = Depends(storage_dep),
) -> JobDetailResponse:
    job = await storage.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job not found")
    return JobDetailResponse(**job)


@app.post("/internal/jobs/fetch", response_model=IngestResponse)
async def internal_jobs_fetch(
    body: IngestRequest,
    x_internal_secret: str | None = Header(default=None, alias="X-Internal-Secret"),
    storage: StorageAdapter = Depends(storage_dep),
) -> IngestResponse:
    """Daily cron entry point. Hit by GitHub Actions in SaaS, APScheduler in desktop.

    Auth: X-Internal-Secret header in SaaS. In desktop mode this endpoint is
    only reachable from localhost via Tauri, so the header is optional.
    """
    if config.is_saas():
        if not config.X_INTERNAL_SECRET or x_internal_secret != config.X_INTERNAL_SECRET:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="invalid internal secret",
            )

    counters = await run_ingestion(
        storage=storage,
        queries=body.queries,
        quality_threshold=body.quality_threshold,
    )
    expired = await storage.mark_expired_jobs()
    return IngestResponse(**counters, expired_marked=expired)


# ══════════════════════════════════════════════════════════════════════
# Phase 3 — Resume + Tracker
# ══════════════════════════════════════════════════════════════════════
from typing import Any
from fastapi import File, UploadFile

from backend.resumes.file_storage import (
    get_file_storage,
    make_resume_key,
)
from backend.resumes.parser import extract_text_from_bytes, parse_resume_text


# ── Tier limits (PRD §11) ────────────────────────────────────────────
FREE_TRACKER_LIMIT = 10  # active applications


VALID_STATUSES = {
    "saved", "applied", "phone_screen", "technical",
    "onsite", "offer", "accepted", "rejected",
}


# ── Models ──────────────────────────────────────────────────────────
class ContactInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    linkedin: str = ""
    github: str = ""
    website: str = ""


class ExperienceItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    role: str = ""
    company: str = ""
    period: str = ""
    description: str = ""
    location: str = ""


class EducationItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    school: str = ""
    degree: str = ""
    period: str = ""
    notes: str = ""


class ProjectItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str = ""
    stack: str = ""
    description: str = ""
    url: str = ""


class MasterResumeResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    contact_info: ContactInfo | None = None
    summary: str | None = None
    experience: list[ExperienceItem] = []
    education: list[EducationItem] = []
    skills: list[str] = []
    projects: list[ProjectItem] = []
    certifications: list[str] = []
    pdf_path: str | None = None
    source: str = "app"
    parse_method: str | None = None
    raw_filename: str | None = None
    created_at: str
    updated_at: str


class MasterResumePut(StrictBody):
    """Manual full-doc replace — bypasses parser."""
    contact_info: ContactInfo | None = None
    summary: str | None = None
    experience: list[ExperienceItem] = []
    education: list[EducationItem] = []
    skills: list[str] = []
    projects: list[ProjectItem] = []
    certifications: list[str] = []


class StatusHistoryEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    status: str
    changed_at: str
    note: str | None = ""


class ApplicationOut(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    job_id: str | None = None
    tailored_resume_id: str | None = None
    title: str
    company: str
    platform: str | None = None
    status: str
    status_history: list[StatusHistoryEntry] = []
    starred: bool = False
    applied_at: str | None = None
    follow_up_date: str | None = None
    follow_up_notified: bool = False
    notes: str | None = None
    created_at: str
    updated_at: str


class ApplicationCreate(StrictBody):
    job_id: str | None = None
    title: str
    company: str
    platform: str | None = None
    status: str = "saved"
    notes: str | None = None
    starred: bool = False


class ApplicationPatch(StrictBody):
    title: str | None = None
    company: str | None = None
    platform: str | None = None
    status: str | None = None
    status_note: str | None = None
    starred: bool | None = None
    applied_at: str | None = None
    follow_up_date: str | None = None
    follow_up_notified: bool | None = None
    notes: str | None = None
    tailored_resume_id: str | None = None


class RecruiterContactCreate(StrictBody):
    name: str
    role: str | None = None
    email: str | None = None
    phone: str | None = None
    linkedin_url: str | None = None
    notes: str | None = None


class RecruiterContactOut(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    application_id: str
    name: str
    role: str | None = None
    email: str | None = None
    phone: str | None = None
    linkedin_url: str | None = None
    notes: str | None = None
    created_at: str


class InterviewCreate(StrictBody):
    round: str  # phone_screen | technical | onsite | final | recruiter
    scheduled_at: str | None = None
    duration_min: int | None = None
    interviewer_names: list[str] = []
    location: str | None = None
    notes: str | None = None
    outcome: str | None = "pending"


class InterviewPatch(StrictBody):
    round: str | None = None
    scheduled_at: str | None = None
    duration_min: int | None = None
    interviewer_names: list[str] | None = None
    location: str | None = None
    notes: str | None = None
    outcome: str | None = None


class InterviewOut(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    application_id: str
    round: str
    scheduled_at: str | None = None
    duration_min: int | None = None
    interviewer_names: list[str] = []
    location: str | None = None
    notes: str | None = None
    outcome: str | None = "pending"
    created_at: str


class SalaryDetailsCreate(StrictBody):
    base_min: int | None = None
    base_max: int | None = None
    bonus: int | None = None
    equity_value: int | None = None
    equity_vesting: str | None = None
    currency: str = "USD"
    notes: str | None = None


class SalaryDetailsOut(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    application_id: str
    base_min: int | None = None
    base_max: int | None = None
    bonus: int | None = None
    equity_value: int | None = None
    equity_vesting: str | None = None
    currency: str = "USD"
    notes: str | None = None
    created_at: str


class ResumeUploadResponse(StrictBody):
    id: str
    parse_method: str
    contact_info: ContactInfo | None = None
    skills_count: int
    experience_count: int


# ══════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════
async def _get_or_load_user_plan(storage: StorageAdapter, user_id: str) -> str:
    user = await storage.get_user(user_id)
    return user["plan"] if user else "free"


async def _enforce_tracker_limit(storage: StorageAdapter, user_id: str) -> None:
    plan = await _get_or_load_user_plan(storage, user_id)
    if plan in ("pro", "coach", "desktop"):
        return
    active = await storage.count_active_applications(user_id)
    if active >= FREE_TRACKER_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Free tier limited to {FREE_TRACKER_LIMIT} active applications. Upgrade to Pro for unlimited tracking.",
        )


async def _ensure_application_owned(
    storage: StorageAdapter, application_id: str, user_id: str
) -> dict[str, Any]:
    app_row = await storage.get_application(application_id, user_id)
    if app_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="application not found")
    return app_row


# ══════════════════════════════════════════════════════════════════════
# Resume endpoints
# ══════════════════════════════════════════════════════════════════════
@app.post("/api/resume/upload", response_model=ResumeUploadResponse)
async def upload_resume(
    file: UploadFile = File(...),
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
) -> ResumeUploadResponse:
    """Accept a PDF/DOCX/TXT resume, parse with Sonnet (or stub), persist as master."""
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="resume file must be under 5 MB",
        )

    text = extract_text_from_bytes(content, file.filename)
    parsed = await parse_resume_text(text, raw_filename=file.filename)
    parse_method = parsed.pop("_parse_method", "sonnet")

    # Persist the original file
    fs = get_file_storage()
    suffix = (file.filename or "resume.txt").rsplit(".", 1)[-1].lower() or "txt"
    pdf_path = await fs.save(
        content,
        key=make_resume_key(user_id, suffix=suffix),
        content_type=file.content_type or "application/octet-stream",
    )

    rid = await storage.upsert_master_resume({
        "user_id": user_id,
        **parsed,
        "pdf_path": pdf_path,
        "source": "app",
        "parse_method": parse_method,
        "raw_filename": file.filename,
    })

    return ResumeUploadResponse(
        id=rid,
        parse_method=parse_method,
        contact_info=ContactInfo(**(parsed.get("contact_info") or {})),
        skills_count=len(parsed.get("skills") or []),
        experience_count=len(parsed.get("experience") or []),
    )


@app.get("/api/me/master-resume", response_model=MasterResumeResponse)
async def get_master_resume(
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
) -> MasterResumeResponse:
    resume = await storage.get_active_master_resume(user_id)
    if resume is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="no master resume — upload one or use the builder",
        )
    return MasterResumeResponse(**resume)


@app.put("/api/me/master-resume", response_model=MasterResumeResponse)
async def put_master_resume(
    body: MasterResumePut,
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
) -> MasterResumeResponse:
    """Manual builder / edit. Creates a NEW master resume row (history preserved)."""
    rid = await storage.upsert_master_resume({
        "user_id": user_id,
        "contact_info": body.contact_info.model_dump() if body.contact_info else None,
        "summary": body.summary,
        "experience": [e.model_dump() for e in body.experience],
        "education": [e.model_dump() for e in body.education],
        "skills": body.skills,
        "projects": [p.model_dump() for p in body.projects],
        "certifications": body.certifications,
        "source": "app",
        "parse_method": "manual",
    })
    resume = await storage.get_master_resume(rid, user_id)
    assert resume is not None
    return MasterResumeResponse(**resume)


# ══════════════════════════════════════════════════════════════════════
# Application endpoints
# ══════════════════════════════════════════════════════════════════════
@app.post("/api/applications", response_model=ApplicationOut, status_code=201)
async def create_application(
    body: ApplicationCreate,
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
) -> ApplicationOut:
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"invalid status; allowed: {sorted(VALID_STATUSES)}")
    if body.status not in ("rejected", "accepted"):
        await _enforce_tracker_limit(storage, user_id)

    aid = await storage.create_application({
        "user_id": user_id,
        **body.model_dump(),
    })
    app_row = await storage.get_application(aid, user_id)
    assert app_row is not None
    return ApplicationOut(**app_row)


@app.get("/api/applications", response_model=list[ApplicationOut])
async def list_applications(
    status: str | None = Query(default=None),
    starred: bool | None = Query(default=None),
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
) -> list[ApplicationOut]:
    if status is not None and status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="invalid status filter")
    rows = await storage.list_applications(user_id, status=status, starred=starred)
    return [ApplicationOut(**r) for r in rows]


@app.get("/api/applications/{application_id}", response_model=ApplicationOut)
async def get_application(
    application_id: str,
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
) -> ApplicationOut:
    app_row = await _ensure_application_owned(storage, application_id, user_id)
    return ApplicationOut(**app_row)


@app.patch("/api/applications/{application_id}", response_model=ApplicationOut)
async def patch_application(
    application_id: str,
    body: ApplicationPatch,
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
) -> ApplicationOut:
    if body.status is not None and body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="invalid status")

    patch = body.model_dump(exclude_unset=True)
    # Re-check tracker limit if a terminal-state app is being moved back to active
    if body.status is not None:
        existing = await _ensure_application_owned(storage, application_id, user_id)
        was_terminal = existing["status"] in ("rejected", "accepted")
        becoming_active = body.status not in ("rejected", "accepted")
        if was_terminal and becoming_active:
            await _enforce_tracker_limit(storage, user_id)

    updated = await storage.update_application(application_id, user_id, patch)
    if updated is None:
        raise HTTPException(status_code=404, detail="application not found")
    return ApplicationOut(**updated)


@app.delete("/api/applications/{application_id}", status_code=204)
async def delete_application(
    application_id: str,
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
) -> None:
    deleted = await storage.delete_application(application_id, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="application not found")


# ══════════════════════════════════════════════════════════════════════
# Application sub-resources
# ══════════════════════════════════════════════════════════════════════
@app.post("/api/applications/{application_id}/contacts", response_model=RecruiterContactOut, status_code=201)
async def add_contact(
    application_id: str,
    body: RecruiterContactCreate,
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
) -> RecruiterContactOut:
    await _ensure_application_owned(storage, application_id, user_id)
    cid = await storage.add_recruiter_contact({
        "application_id": application_id,
        **body.model_dump(),
    })
    rows = await storage.list_recruiter_contacts(application_id)
    out = next((c for c in rows if c["id"] == cid), None)
    assert out is not None
    return RecruiterContactOut(**out)


@app.get("/api/applications/{application_id}/contacts", response_model=list[RecruiterContactOut])
async def list_contacts(
    application_id: str,
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
) -> list[RecruiterContactOut]:
    await _ensure_application_owned(storage, application_id, user_id)
    rows = await storage.list_recruiter_contacts(application_id)
    return [RecruiterContactOut(**r) for r in rows]


@app.post("/api/applications/{application_id}/interviews", response_model=InterviewOut, status_code=201)
async def add_interview(
    application_id: str,
    body: InterviewCreate,
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
) -> InterviewOut:
    await _ensure_application_owned(storage, application_id, user_id)
    iid = await storage.add_interview({
        "application_id": application_id,
        **body.model_dump(),
    })
    rows = await storage.list_interviews(application_id)
    out = next((i for i in rows if i["id"] == iid), None)
    assert out is not None
    return InterviewOut(**out)


@app.get("/api/applications/{application_id}/interviews", response_model=list[InterviewOut])
async def list_interviews(
    application_id: str,
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
) -> list[InterviewOut]:
    await _ensure_application_owned(storage, application_id, user_id)
    rows = await storage.list_interviews(application_id)
    return [InterviewOut(**r) for r in rows]


@app.patch(
    "/api/applications/{application_id}/interviews/{interview_id}",
    response_model=InterviewOut,
)
async def patch_interview(
    application_id: str,
    interview_id: str,
    body: InterviewPatch,
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
) -> InterviewOut:
    await _ensure_application_owned(storage, application_id, user_id)
    updated = await storage.update_interview(
        interview_id, application_id, body.model_dump(exclude_unset=True)
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="interview not found")
    return InterviewOut(**updated)


@app.post("/api/applications/{application_id}/salary", response_model=SalaryDetailsOut, status_code=201)
async def add_salary(
    application_id: str,
    body: SalaryDetailsCreate,
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
) -> SalaryDetailsOut:
    await _ensure_application_owned(storage, application_id, user_id)
    sid = await storage.add_salary_details({
        "application_id": application_id,
        **body.model_dump(),
    })
    rows = await storage.list_salary_details(application_id)
    out = next((s for s in rows if s["id"] == sid), None)
    assert out is not None
    return SalaryDetailsOut(**out)


@app.get("/api/applications/{application_id}/salary", response_model=list[SalaryDetailsOut])
async def list_salary(
    application_id: str,
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
) -> list[SalaryDetailsOut]:
    await _ensure_application_owned(storage, application_id, user_id)
    rows = await storage.list_salary_details(application_id)
    return [SalaryDetailsOut(**r) for r in rows]



# ══════════════════════════════════════════════════════════════════════
# Phase 5 — AI Tailor + PDF
# ══════════════════════════════════════════════════════════════════════
from fastapi.responses import FileResponse, RedirectResponse

from backend.tailor.service import TAILOR_LIMITS, run_tailor


class TailorRequest(StrictBody):
    job_id: str


class TailorResponse(StrictBody):
    id: str
    ats_score: int
    match_points: list[str]
    gaps: list[str]
    keywords_added: list[str]
    content_markdown: str
    pdf_url: str            # signed URL for the PDF (or HTML fallback)
    pdf_extension: str      # "pdf" or "html"
    sonnet_method: str
    tailor_count_month: int
    tailor_limit: int


class TailoredResumeOut(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    job_id: str | None = None
    master_resume_id: str
    content_markdown: str | None = None
    ats_score: int | None = None
    match_points: list[str] = []
    gaps: list[str] = []
    keywords_added: list[str] = []
    pdf_path: str | None = None
    source: str = "app"
    sonnet_method: str | None = None
    created_at: str


@app.post("/api/resume/tailor", response_model=TailorResponse)
async def tailor_resume_endpoint(
    body: TailorRequest,
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
) -> TailorResponse:
    """Run the full tailor pipeline and persist the result.

    Errors:
      - 402 if user has hit their monthly tailor limit
      - 404 if the user has no master resume or the job_id doesn't exist
    """
    master = await storage.get_active_master_resume(user_id)
    if master is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="upload a master resume first via POST /api/resume/upload",
        )
    job = await storage.get_job(body.job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job not found")

    user = await storage.get_user(user_id)
    plan = user["plan"] if user else "free"

    fs = get_file_storage()
    result = await run_tailor(
        storage=storage,
        file_storage=fs,
        user_id=user_id,
        user_plan=plan,
        job=job,
        master=master,
    )

    pdf_url = await fs.get_signed_url(result.pdf_path or "", ttl_seconds=3600)
    return TailorResponse(
        id=result.id,
        ats_score=result.ats_score,
        match_points=result.match_points,
        gaps=result.gaps,
        keywords_added=result.keywords_added,
        content_markdown=result.content_markdown,
        pdf_url=pdf_url,
        pdf_extension=result.pdf_extension,
        sonnet_method=result.sonnet_method,
        tailor_count_month=result.tailor_count_month,
        tailor_limit=result.tailor_limit,
    )


@app.get("/api/tailored-resumes", response_model=list[TailoredResumeOut])
async def list_tailored_resumes(
    job_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
) -> list[TailoredResumeOut]:
    rows = await storage.list_tailored_resumes(user_id, job_id=job_id, limit=limit)
    return [TailoredResumeOut(**r) for r in rows]


@app.get("/api/tailored-resumes/{tailored_id}", response_model=TailoredResumeOut)
async def get_tailored_resume(
    tailored_id: str,
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
) -> TailoredResumeOut:
    row = await storage.get_tailored_resume(tailored_id, user_id)
    if row is None:
        raise HTTPException(status_code=404, detail="tailored resume not found")
    return TailoredResumeOut(**row)


@app.get("/api/tailored-resumes/{tailored_id}/pdf")
async def download_tailored_pdf(
    tailored_id: str,
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
):
    """Stream the PDF/HTML for the tailored resume.

    Desktop: serves the local file directly.
    SaaS: redirects to a Cloudflare R2 signed URL (TTL 1h).
    """
    row = await storage.get_tailored_resume(tailored_id, user_id)
    if row is None or not row.get("pdf_path"):
        raise HTTPException(status_code=404, detail="tailored resume PDF not found")

    pdf_key = row["pdf_path"]
    fs = get_file_storage()

    if config.is_desktop():
        # LocalFileStorage stores keys; resolve to disk path through the adapter.
        from pathlib import Path
        from backend.resumes.file_storage import LocalFileStorage
        if isinstance(fs, LocalFileStorage):
            p = fs._path(pdf_key)  # private but fine inside our module
        else:
            p = Path(pdf_key)
        if not p.exists():
            raise HTTPException(status_code=404, detail="resume file missing on disk")
        media_type = "application/pdf" if p.suffix == ".pdf" else "text/html"
        return FileResponse(p, media_type=media_type, filename=p.name)

    # SaaS — generate signed R2 URL
    url = await fs.get_signed_url(pdf_key, ttl_seconds=3600)
    return RedirectResponse(url=url, status_code=302)


@app.get("/api/me/tailor-quota")
async def get_tailor_quota(
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
) -> dict[str, Any]:
    """Returns current usage + limit. Useful for UI to show 'X/3 used this month'."""
    user = await storage.get_user(user_id)
    plan = user["plan"] if user else "free"
    current = await storage.reset_tailor_count_if_due(user_id)
    return {
        "plan": plan,
        "tailor_count_month": current,
        "tailor_limit": TAILOR_LIMITS.get(plan, TAILOR_LIMITS["free"]),
    }


# ══════════════════════════════════════════════════════════════════════
# Phase 8 — Cover Letter + Interview Prep (Pro/Coach features)
# ══════════════════════════════════════════════════════════════════════
from backend.ai.cover_letter import (
    VALID_TONES,
    generate_cover_letter,
)
from backend.ai.interview_prep import generate_interview_prep
from backend.tailor.pdf_render import html_to_pdf_bytes
import logging
import re as _re_p8  # local alias to avoid colliding with anything else in main.py

log = logging.getLogger("appname.main")


# ── Pro+ gate ───────────────────────────────────────────────────────
PRO_PLUS = {"pro", "coach", "desktop"}


async def _require_pro_plus(storage: StorageAdapter, user_id: str) -> str:
    user = await storage.get_user(user_id)
    plan = user["plan"] if user else "free"
    if plan not in PRO_PLUS:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Pro feature. Upgrade to Pro ($19/mo) or Coach ($49/mo) to unlock cover letters and interview prep.",
        )
    return plan


# ── Models ──────────────────────────────────────────────────────────
class CoverLetterRequest(StrictBody):
    job_id: str
    tailored_resume_id: str | None = None
    tone: str = "professional"  # professional | enthusiastic | concise


class CoverLetterResponse(StrictBody):
    id: str
    job_id: str
    tailored_resume_id: str | None = None
    content_markdown: str
    tone: str
    pdf_url: str
    pdf_extension: str
    sonnet_method: str
    notes: str
    created_at: str


class CoverLetterOut(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    job_id: str
    tailored_resume_id: str | None = None
    content_markdown: str
    tone: str
    pdf_path: str | None = None
    sonnet_method: str | None = None
    created_at: str


class InterviewPrepRequest(StrictBody):
    job_id: str


class InterviewQuestionOut(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type: str
    question: str
    why_asked: str = ""
    suggested_approach: str = ""


class InterviewPrepOut(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    job_id: str
    questions: list[InterviewQuestionOut] = []
    strengths: list[str] = []
    gaps_to_address: list[str] = []
    talking_points: list[str] = []
    haiku_method: str | None = None
    created_at: str


# ── Cover letter endpoints ──────────────────────────────────────────
def _render_cover_letter_html(
    candidate_name: str, contact: dict[str, Any], company: str, role: str, body_md: str
) -> str:
    """Convert markdown cover letter to a clean ATS-friendly HTML doc."""
    import html as _html

    def esc(v: Any) -> str:
        return _html.escape(str(v or ""))

    # Strip "Dear ..." salutation if Sonnet included it (we render it separately)
    body = body_md.strip()

    # Convert markdown paragraphs to HTML <p>
    paragraphs = [p.strip() for p in _re_p8.split(r"\n\s*\n", body) if p.strip()]
    body_html = "\n".join(f"<p>{esc(p)}</p>" for p in paragraphs)

    contact_bits = [contact.get("email"), contact.get("phone"), contact.get("location")]
    contact_line = " · ".join(esc(b) for b in contact_bits if b)

    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Cover Letter</title>
<style>
  @page {{ size: Letter; margin: 0.85in; }}
  body {{ font-family: 'Helvetica', 'Arial', sans-serif; color: #111827; font-size: 11pt; line-height: 1.55; }}
  h1 {{ font-size: 18pt; margin: 0 0 4pt; color: #5B21B6; }}
  .contact {{ font-size: 10pt; color: #4B5563; margin-bottom: 24pt; }}
  .meta {{ margin-bottom: 18pt; color: #4B5563; font-size: 10pt; }}
  p {{ margin: 0 0 11pt; }}
</style></head>
<body>
  <h1>{esc(candidate_name)}</h1>
  {f'<div class="contact">{contact_line}</div>' if contact_line else ''}
  <div class="meta">{esc(company)} · {esc(role)}</div>
  {body_html}
</body></html>"""


@app.post("/api/cover-letter", response_model=CoverLetterResponse)
async def create_cover_letter(
    body: CoverLetterRequest,
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
) -> CoverLetterResponse:
    """Generate a Sonnet-written cover letter for one job. Pro+ only."""
    await _require_pro_plus(storage, user_id)

    if body.tone not in VALID_TONES:
        raise HTTPException(status_code=400, detail=f"tone must be one of {sorted(VALID_TONES)}")

    master = await storage.get_active_master_resume(user_id)
    if master is None:
        raise HTTPException(status_code=404, detail="upload a master resume first")
    job = await storage.get_job(body.job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")

    if body.tailored_resume_id:
        tr = await storage.get_tailored_resume(body.tailored_resume_id, user_id)
        if tr is None:
            raise HTTPException(status_code=404, detail="tailored_resume_id not found")

    contact = master.get("contact_info") or {}
    candidate_name = contact.get("name") or "Candidate"
    company = job.get("company") or ""
    role = job.get("title") or ""

    out, meta = await generate_cover_letter(
        candidate_name=candidate_name,
        company=company,
        role=role,
        master=master,
        job=job,
        tone=body.tone,
    )

    # Render to PDF
    html_str = _render_cover_letter_html(
        candidate_name, contact, company, role, out.content_markdown
    )
    pdf_bytes = html_to_pdf_bytes(html_str)
    extension = "pdf" if pdf_bytes else "html"
    body_bytes = pdf_bytes if pdf_bytes else html_str.encode("utf-8")
    content_type = "application/pdf" if pdf_bytes else "text/html"

    fs = get_file_storage()
    pdf_key = make_resume_key(user_id, suffix=f"cover.{extension}")
    pdf_path = await fs.save(body_bytes, key=pdf_key, content_type=content_type)

    cid = await storage.save_cover_letter({
        "user_id": user_id,
        "job_id": body.job_id,
        "tailored_resume_id": body.tailored_resume_id,
        "content_markdown": out.content_markdown,
        "tone": body.tone,
        "pdf_path": pdf_path,
        "sonnet_method": meta["method"],
        "tokens_in": meta.get("tokens_in", 0),
        "tokens_out": meta.get("tokens_out", 0),
    })

    pdf_url = await fs.get_signed_url(pdf_path, ttl_seconds=3600)
    row = await storage.get_cover_letter(cid, user_id)
    assert row is not None

    log.info(
        "cover_letter user=%s job=%s method=%s tokens=%d/%d",
        user_id, body.job_id, meta["method"],
        meta.get("tokens_in", 0), meta.get("tokens_out", 0),
    )

    return CoverLetterResponse(
        id=cid,
        job_id=body.job_id,
        tailored_resume_id=body.tailored_resume_id,
        content_markdown=out.content_markdown,
        tone=body.tone,
        pdf_url=pdf_url,
        pdf_extension=extension,
        sonnet_method=meta["method"],
        notes=out.notes,
        created_at=row["created_at"],
    )


@app.get("/api/cover-letters", response_model=list[CoverLetterOut])
async def list_cover_letters(
    job_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
) -> list[CoverLetterOut]:
    rows = await storage.list_cover_letters(user_id, job_id=job_id, limit=limit)
    return [CoverLetterOut(**r) for r in rows]


@app.get("/api/cover-letters/{cover_id}", response_model=CoverLetterOut)
async def get_cover_letter(
    cover_id: str,
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
) -> CoverLetterOut:
    row = await storage.get_cover_letter(cover_id, user_id)
    if row is None:
        raise HTTPException(status_code=404, detail="cover letter not found")
    return CoverLetterOut(**row)


@app.get("/api/cover-letters/{cover_id}/pdf")
async def download_cover_letter_pdf(
    cover_id: str,
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
):
    row = await storage.get_cover_letter(cover_id, user_id)
    if row is None or not row.get("pdf_path"):
        raise HTTPException(status_code=404, detail="cover letter PDF not found")

    pdf_key = row["pdf_path"]
    fs = get_file_storage()

    if config.is_desktop():
        from pathlib import Path
        from backend.resumes.file_storage import LocalFileStorage
        if isinstance(fs, LocalFileStorage):
            p = fs._path(pdf_key)
        else:
            p = Path(pdf_key)
        if not p.exists():
            raise HTTPException(status_code=404, detail="cover letter file missing on disk")
        media_type = "application/pdf" if p.suffix == ".pdf" else "text/html"
        return FileResponse(p, media_type=media_type, filename=p.name)

    url = await fs.get_signed_url(pdf_key, ttl_seconds=3600)
    return RedirectResponse(url=url, status_code=302)


# ── Interview prep endpoints ────────────────────────────────────────
@app.post("/api/interview-prep", response_model=InterviewPrepOut)
async def create_interview_prep(
    body: InterviewPrepRequest,
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
) -> InterviewPrepOut:
    """Generate Q&A bank for a job. Pro+ only. Uses Haiku 4.5 (batch task)."""
    await _require_pro_plus(storage, user_id)

    master = await storage.get_active_master_resume(user_id)
    if master is None:
        raise HTTPException(status_code=404, detail="upload a master resume first")
    job = await storage.get_job(body.job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")

    out, meta = await generate_interview_prep(master, job)

    pid = await storage.save_interview_prep({
        "user_id": user_id,
        "job_id": body.job_id,
        "questions": [q.model_dump() for q in out.questions],
        "strengths": out.strengths,
        "gaps_to_address": out.gaps_to_address,
        "talking_points": out.talking_points,
        "haiku_method": meta["method"],
        "tokens_in": meta.get("tokens_in", 0),
        "tokens_out": meta.get("tokens_out", 0),
    })

    log.info(
        "interview_prep user=%s job=%s method=%s tokens=%d/%d questions=%d",
        user_id, body.job_id, meta["method"],
        meta.get("tokens_in", 0), meta.get("tokens_out", 0),
        len(out.questions),
    )

    row = await storage.get_interview_prep(pid, user_id)
    assert row is not None
    return InterviewPrepOut(**row)


@app.get("/api/interview-prep", response_model=list[InterviewPrepOut])
async def list_interview_prep(
    job_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
) -> list[InterviewPrepOut]:
    rows = await storage.list_interview_prep(user_id, job_id=job_id, limit=limit)
    return [InterviewPrepOut(**r) for r in rows]


@app.get("/api/interview-prep/{prep_id}", response_model=InterviewPrepOut)
async def get_interview_prep(
    prep_id: str,
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
) -> InterviewPrepOut:
    row = await storage.get_interview_prep(prep_id, user_id)
    if row is None:
        raise HTTPException(status_code=404, detail="interview prep not found")
    return InterviewPrepOut(**row)


# ══════════════════════════════════════════════════════════════════════
# Phase 6 — Daily Digest Email + Push Notifications
# ══════════════════════════════════════════════════════════════════════
from backend.notifications.email import (
    render_digest_html, render_digest_text, send_email,
)
from backend.notifications.push import (
    is_valid_expo_token, send_push_to_user,
)


def _require_internal_secret(x_internal_secret: str | None) -> None:
    """In SaaS mode the internal cron endpoints require this header. In
    desktop mode the header check is skipped — the endpoints aren't reachable
    from the network anyway (CORS blocks browser, server is bound to 127.0.0.1).
    """
    if config.is_desktop():
        return
    if not config.X_INTERNAL_SECRET or x_internal_secret != config.X_INTERNAL_SECRET:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")


# ── Push token endpoints (mobile registers on launch) ────────────────
class PushTokenRegisterBody(StrictBody):
    expo_token: str
    platform: str | None = None      # "ios" | "android" | "web"
    device_name: str | None = None


class PushTokenOut(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    expo_token: str
    platform: str | None = None
    device_name: str | None = None
    enabled: bool
    created_at: str
    last_seen_at: str | None = None


@app.post("/api/me/push-tokens", response_model=PushTokenOut, status_code=201)
async def register_push_token(
    body: PushTokenRegisterBody,
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
) -> PushTokenOut:
    if not is_valid_expo_token(body.expo_token):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="not a valid Expo push token (expected ExponentPushToken[...])",
        )
    tok_id = await storage.upsert_push_token(
        user_id, body.expo_token, platform=body.platform, device_name=body.device_name,
    )
    rows = await storage.list_push_tokens(user_id, enabled_only=False)
    row = next((r for r in rows if r["id"] == tok_id), None)
    assert row is not None
    return PushTokenOut(**{**row, "enabled": bool(row["enabled"])})


@app.delete("/api/me/push-tokens/{expo_token:path}", status_code=204)
async def disable_push_token(
    expo_token: str,
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
) -> None:
    # Defensive: ensure the token belongs to this user before disabling.
    rows = await storage.list_push_tokens(user_id, enabled_only=False)
    if not any(r["expo_token"] == expo_token for r in rows):
        raise HTTPException(status_code=404, detail="push token not found")
    await storage.disable_push_token(expo_token)


# ── Notification preferences ─────────────────────────────────────────
class NotificationPrefsBody(StrictBody):
    digest_enabled: bool | None = None
    push_enabled: bool | None = None
    digest_count: int | None = Field(default=None, ge=1, le=20)
    digest_hour_utc: int | None = Field(default=None, ge=0, le=23)
    timezone: str | None = None


class NotificationPrefsOut(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    digest_enabled: bool
    push_enabled: bool
    digest_count: int
    digest_hour_utc: int
    timezone: str
    updated_at: str


@app.get("/api/me/notification-preferences", response_model=NotificationPrefsOut)
async def get_notif_prefs(
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
) -> NotificationPrefsOut:
    prefs = await storage.get_notification_preferences(user_id)
    return NotificationPrefsOut(**prefs)


@app.put("/api/me/notification-preferences", response_model=NotificationPrefsOut)
async def put_notif_prefs(
    body: NotificationPrefsBody,
    user_id: str = Depends(require_user),
    storage: StorageAdapter = Depends(storage_dep),
) -> NotificationPrefsOut:
    patch = body.model_dump(exclude_unset=True)
    prefs = await storage.update_notification_preferences(user_id, patch)
    return NotificationPrefsOut(**prefs)


# ══════════════════════════════════════════════════════════════════════
# Internal cron endpoints (called by GitHub Actions w/ X-Internal-Secret)
# ══════════════════════════════════════════════════════════════════════
class DigestRunBody(StrictBody):
    digest_hour_utc: int = Field(default=6, ge=0, le=23)
    """The hour-bucket to send. Cron at 6:15 UTC sends the bucket=6 group."""


class DigestRunResponse(StrictBody):
    sent: int
    skipped_no_jobs: int
    failed: int
    errors: list[str] = []


@app.post("/internal/digest/run", response_model=DigestRunResponse)
async def run_daily_digest(
    body: DigestRunBody,
    x_internal_secret: str | None = Header(default=None, alias="X-Internal-Secret"),
    storage: StorageAdapter = Depends(storage_dep),
) -> DigestRunResponse:
    _require_internal_secret(x_internal_secret)

    web_base = os.getenv("WEB_BASE_URL", "http://127.0.0.1:3000")
    users = await storage.list_users_for_digest(body.digest_hour_utc)

    sent = 0
    skipped = 0
    failed = 0
    errors: list[str] = []

    for u in users:
        try:
            jobs = await storage.jobs_for_user_digest(
                u["id"], limit=int(u.get("digest_count") or 5),
            )
            if not jobs:
                skipped += 1
                continue

            subject, html_body = render_digest_html(
                user_email=u["email"],
                plan=u.get("plan", "free"),
                jobs=jobs,
                web_base_url=web_base,
            )
            text_body = render_digest_text(jobs=jobs, web_base_url=web_base)

            res = await send_email(
                to=u["email"],
                subject=subject,
                html_body=html_body,
                text_body=text_body,
            )
            await storage.log_email_digest(
                u["id"],
                subject=subject,
                job_ids=[j["id"] for j in jobs],
                resend_id=res.get("id"),
            )
            sent += 1
        except Exception as exc:  # noqa: BLE001
            failed += 1
            err_msg = f"{u.get('email', u['id'])}: {exc}"
            errors.append(err_msg)
            log.warning("digest send failed for %s", err_msg)

    return DigestRunResponse(sent=sent, skipped_no_jobs=skipped, failed=failed, errors=errors[:10])


class PushRunResponse(StrictBody):
    interview_reminders: int
    follow_up_reminders: int
    stale_alerts: int
    tokens_disabled: int


@app.post("/internal/push/run", response_model=PushRunResponse)
async def run_push_notifications(
    x_internal_secret: str | None = Header(default=None, alias="X-Internal-Secret"),
    storage: StorageAdapter = Depends(storage_dep),
) -> PushRunResponse:
    _require_internal_secret(x_internal_secret)

    interview_count = 0
    follow_up_count = 0
    stale_count = 0
    tokens_disabled = 0

    async def _push_for_user(user_id: str, *, kind: str, title: str, body: str,
                             application_id: str | None = None) -> None:
        """Send to all of a user's enabled devices, log result, disable broken tokens."""
        nonlocal tokens_disabled
        prefs = await storage.get_notification_preferences(user_id)
        if not prefs.get("push_enabled", True):
            return

        rows = await storage.list_push_tokens(user_id, enabled_only=True)
        if not rows:
            return

        results = await send_push_to_user(
            expo_tokens=[r["expo_token"] for r in rows],
            title=title,
            body=body,
            data={"application_id": application_id} if application_id else None,
        )
        for tok, ticket in results:
            if ticket.get("status") == "error":
                err = (ticket.get("details") or {}).get("error") or ticket.get("message", "unknown")
                if err in ("DeviceNotRegistered", "InvalidCredentials"):
                    await storage.disable_push_token(tok, error=err)
                    tokens_disabled += 1

        await storage.log_push_notification(
            user_id, kind=kind, title=title, body=body, application_id=application_id,
        )

    # 1) Interview reminders (24h ahead)
    upcoming = await storage.applications_with_upcoming_interviews(hours_ahead=24)
    for app in upcoming:
        when = app.get("interview_scheduled_at", "")
        round_label = (app.get("interview_round") or "interview").replace("_", " ")
        await _push_for_user(
            app["user_id"],
            kind="interview_reminder",
            title=f"Interview tomorrow: {app['company']}",
            body=f"{round_label.capitalize()} for {app['title']} at {when}",
            application_id=app["id"],
        )
        interview_count += 1

    # 2) Follow-up reminders
    follow_ups = await storage.applications_with_due_follow_ups()
    for app in follow_ups:
        await _push_for_user(
            app["user_id"],
            kind="follow_up",
            title=f"Time to follow up: {app['company']}",
            body=f"You set a reminder for {app['title']}",
            application_id=app["id"],
        )
        await storage.update_application(
            app["id"], app["user_id"], {"follow_up_notified": True},
        )
        follow_up_count += 1

    # 3) Stale alerts (14+ days no movement)
    stale = await storage.stale_applications(days=14)
    for app in stale:
        await _push_for_user(
            app["user_id"],
            kind="stale_application",
            title=f"Still waiting on {app['company']}?",
            body=f"{app['title']} hasn't moved in 2+ weeks. Time to follow up?",
            application_id=app["id"],
        )
        stale_count += 1

    return PushRunResponse(
        interview_reminders=interview_count,
        follow_up_reminders=follow_up_count,
        stale_alerts=stale_count,
        tokens_disabled=tokens_disabled,
    )
