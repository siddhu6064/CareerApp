"""Deterministic ATS scoring. Wraps the JustHireMe scoring_engine port and
adapts our master_resumes shape to its expected candidate_data dict.

This pre-LLM pass is the core PRD v5.1 §16 win — it lets us:
  - Show ATS score on every job card without spending a Sonnet call
  - Skip the Sonnet tailor entirely for hopeless matches (huge token saving)
  - Pass match_points / gaps INTO the Sonnet prompt so output is calibrated
"""
from __future__ import annotations

from typing import Any

from backend.agents.justhireme.scoring_engine import score_job_lead


def _to_jh_candidate(master: dict[str, Any]) -> dict[str, Any]:
    """Map our master_resumes row to JustHireMe's candidate_data shape.

    JustHireMe expects: { n, s, skills:[{n,cat}], exp:[{role,co,period,d}], projects:[{title,stack,impact,s}] }
    """
    contact = master.get("contact_info") or {}
    skills_raw = master.get("skills") or []
    exp_raw = master.get("experience") or []
    proj_raw = master.get("projects") or []

    return {
        "n": (contact or {}).get("name", "") if isinstance(contact, dict) else "",
        "s": master.get("summary") or "",
        "skills": [{"n": s, "cat": "general"} for s in skills_raw if s],
        "exp": [
            {
                "role": e.get("role", ""),
                "co": e.get("company", ""),
                "period": e.get("period", ""),
                "d": e.get("description", ""),
                "s": [],
            }
            for e in exp_raw if isinstance(e, dict)
        ],
        "projects": [
            {
                "title": p.get("title", ""),
                "stack": p.get("stack", ""),
                "repo": p.get("url", ""),
                "impact": p.get("description", ""),
                "s": [],
            }
            for p in proj_raw if isinstance(p, dict)
        ],
        "certifications": master.get("certifications") or [],
        "education": master.get("education") or [],
        "achievements": [],
    }


def _job_to_text(job: dict[str, Any]) -> str:
    """Concatenate job fields into one text blob for the scorer."""
    parts = [
        f"Title: {job.get('title', '')}",
        f"Company: {job.get('company', '')}",
        f"Location: {job.get('location', '')}",
        f"Description: {job.get('jd_raw', '')}",
    ]
    return "\n".join(parts)


def deterministic_score(master: dict[str, Any], job: dict[str, Any]) -> dict[str, Any]:
    """Returns { score, reason, match_points, gaps } — same shape as scoring_engine."""
    candidate_data = _to_jh_candidate(master)
    posting_text = _job_to_text(job)
    # NB: score_job_lead signature is (jd, candidate_data) — JD first
    result = score_job_lead(posting_text, candidate_data)
    return {
        "score": int(result.score),
        "reason": result.reason,
        "match_points": list(result.match_points),
        "gaps": list(result.gaps),
    }
