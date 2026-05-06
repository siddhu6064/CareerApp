"""Tailor orchestration. Runs the full Phase 5 pipeline:

  1. Gate: monthly reset + tier limit check (Free 3, Pro 100, Coach 100, Desktop ∞)
  2. Score: deterministic ATS via JustHireMe scoring_engine (no token cost)
  3. Tailor: Sonnet structured rewrite (or stub fallback)
  4. Render: HTML → PDF via WeasyPrint (HTML fallback if native libs missing)
  5. Persist: save PDF/HTML bytes to file storage + tailored_resumes row + bump count

Returns a TailorResult the endpoint serializes directly.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, status

from backend.resumes.file_storage import FileStorageAdapter, make_resume_key
from backend.storage import StorageAdapter
from backend.tailor.pdf_render import html_to_pdf_bytes, render_resume_html
from backend.tailor.scorer import deterministic_score
from backend.tailor.sonnet import tailor_resume

log = logging.getLogger(__name__)


# Tier limits (PRD §11)
TAILOR_LIMITS = {
    "free": 3,
    "pro": 100,
    "coach": 100,
    "desktop": 10**9,  # effectively unlimited (BYOK)
}


@dataclass
class TailorResult:
    id: str
    ats_score: int
    match_points: list[str]
    gaps: list[str]
    keywords_added: list[str]
    content_markdown: str
    pdf_path: str | None
    pdf_extension: str  # "pdf" or "html" (fallback)
    sonnet_method: str  # "sonnet" | "stub"
    tailor_count_month: int
    tailor_limit: int


def _to_markdown(contact_info: dict[str, Any], tailored: dict[str, Any]) -> str:
    """Render the tailored content as Markdown (for diff view + storage)."""
    lines: list[str] = []
    name = (contact_info or {}).get("name") or "Resume"
    lines.append(f"# {name}")

    contact_bits = [
        contact_info.get("email"),
        contact_info.get("phone"),
        contact_info.get("location"),
        contact_info.get("linkedin"),
        contact_info.get("github"),
        contact_info.get("website"),
    ]
    contact_line = " · ".join(b for b in contact_bits if b)
    if contact_line:
        lines.append(contact_line)
    lines.append("")

    if tailored.get("summary"):
        lines.append("## Summary")
        lines.append(tailored["summary"])
        lines.append("")

    if tailored.get("experience"):
        lines.append("## Experience")
        for e in tailored["experience"]:
            head = f"**{e.get('role','')}** — {e.get('company','')}"
            if e.get("period"):
                head += f"  ·  *{e['period']}*"
            lines.append(head)
            for b in e.get("bullets") or []:
                lines.append(f"- {b}")
            lines.append("")

    if tailored.get("skills"):
        lines.append("## Skills")
        lines.append(", ".join(tailored["skills"]))
        lines.append("")

    if tailored.get("selected_projects"):
        lines.append("## Selected Projects")
        for p in tailored["selected_projects"]:
            lines.append(f"- {p}")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


async def run_tailor(
    *,
    storage: StorageAdapter,
    file_storage: FileStorageAdapter,
    user_id: str,
    user_plan: str,
    job: dict[str, Any],
    master: dict[str, Any],
) -> TailorResult:
    # ── Gate: reset count if monthly window elapsed, then check limit ────
    current_count = await storage.reset_tailor_count_if_due(user_id)
    limit = TAILOR_LIMITS.get(user_plan, TAILOR_LIMITS["free"])
    if current_count >= limit:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                f"Tailor limit reached ({current_count}/{limit} this month). "
                "Upgrade to Pro for 100/month."
            ),
        )

    # ── Score: deterministic pre-pass ───────────────────────────────────
    score = deterministic_score(master, job)

    # ── Sonnet rewrite (or stub) ────────────────────────────────────────
    tailored_obj, meta = await tailor_resume(master, job, score)
    tailored = tailored_obj.model_dump()

    # ── Render: HTML → PDF (with HTML fallback) ─────────────────────────
    contact_info = master.get("contact_info") or {}
    html_str = render_resume_html(contact_info, tailored)
    pdf_bytes = html_to_pdf_bytes(html_str)

    extension = "pdf" if pdf_bytes else "html"
    body_bytes = pdf_bytes if pdf_bytes else html_str.encode("utf-8")
    content_type = "application/pdf" if pdf_bytes else "text/html"

    pdf_key = make_resume_key(user_id, suffix=f"tailored.{extension}")
    pdf_path = await file_storage.save(body_bytes, key=pdf_key, content_type=content_type)

    # ── Persist row + bump count atomically (best effort in SQLite) ─────
    content_markdown = _to_markdown(contact_info, tailored)

    keywords_added = (
        tailored.get("keywords_used")
        or score.get("match_points", [])[:8]
    )

    tid = await storage.save_tailored_resume({
        "user_id": user_id,
        "job_id": job.get("id"),
        "master_resume_id": master["id"],
        "content_markdown": content_markdown,
        "ats_score": score["score"],
        "match_points": score["match_points"],
        "gaps": score["gaps"],
        "keywords_added": keywords_added,
        "pdf_path": pdf_path,
        "source": "app",
        "sonnet_method": meta["method"],
    })
    new_count = await storage.increment_tailor_count(user_id)

    log.info(
        "tailor user=%s job=%s ats=%d method=%s tokens=%d/%d",
        user_id, job.get("id"), score["score"], meta["method"],
        meta.get("tokens_in", 0), meta.get("tokens_out", 0),
    )

    return TailorResult(
        id=tid,
        ats_score=score["score"],
        match_points=score["match_points"],
        gaps=score["gaps"],
        keywords_added=list(keywords_added),
        content_markdown=content_markdown,
        pdf_path=pdf_path,
        pdf_extension=extension,
        sonnet_method=meta["method"],
        tailor_count_month=new_count,
        tailor_limit=limit,
    )
