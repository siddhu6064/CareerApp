"""Ashby public job-board adapter.

API: https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true

No auth (job board is public). Free.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from backend.agents.sources.greenhouse import _stub_jobs, _strip_html

log = logging.getLogger(__name__)

ASHBY_BOARD_URL = "https://api.ashbyhq.com/posting-api/job-board/{slug}"


def _normalize_ashby(item: dict[str, Any], company_slug: str) -> dict[str, Any]:
    workplace = (item.get("workplaceType") or "").lower()
    if workplace == "remote":
        remote_type = "remote"
    elif workplace == "hybrid":
        remote_type = "hybrid"
    else:
        remote_type = "onsite"
    comp = item.get("compensation") or {}
    salary_range = (comp.get("compensationTierSummary") or "")
    return {
        "title": (item.get("title") or "").strip(),
        "company": company_slug,
        "description": _strip_html(item.get("descriptionHtml") or ""),
        "location": item.get("location") or "",
        "remote_type": remote_type,
        "apply_url": item.get("jobUrl") or "",
        "posted_date": item.get("publishedAt") or "",
        "source": "ashby",
        "source_id": item.get("id") or "",
        "salary_min": None,
        "salary_max": None,
        "tech_stack": [],
        "employment_type": item.get("employmentType") or "",
    }


async def fetch_ashby(
    company_slugs: list[str], *, timeout_s: float = 10.0,
) -> list[dict[str, Any]]:
    if os.getenv("STUB_JOBS_API", "0") == "1":
        log.info("STUB_JOBS_API=1 → returning Ashby stub for %d slugs", len(company_slugs))
        return _stub_jobs("ashby", company_slugs)

    out: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=timeout_s) as client:
        for slug in company_slugs:
            slug = slug.strip().lower()
            if not slug:
                continue
            try:
                r = await client.get(
                    ASHBY_BOARD_URL.format(slug=slug),
                    params={"includeCompensation": "true"},
                    headers={"User-Agent": "AppName-desktop/0.1"},
                )
                if r.status_code != 200:
                    log.warning("ashby %s → %d", slug, r.status_code)
                    continue
                payload = r.json() or {}
                jobs = payload.get("jobs") or []
                for job in jobs:
                    out.append(_normalize_ashby(job, slug))
            except Exception as exc:  # noqa: BLE001
                log.warning("ashby fetch failed for %s: %s", slug, exc)
    return out
