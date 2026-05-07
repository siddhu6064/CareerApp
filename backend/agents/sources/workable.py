"""Workable public job-board adapter.

Workable exposes a per-account public board at
    https://apply.workable.com/api/v3/accounts/{slug}/jobs
which returns JSON. No auth required.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from backend.agents.sources.greenhouse import _stub_jobs, _strip_html

log = logging.getLogger(__name__)

WORKABLE_BOARD_URL = "https://apply.workable.com/api/v3/accounts/{slug}/jobs"


def _normalize_workable(item: dict[str, Any], company_slug: str) -> dict[str, Any]:
    location = item.get("location") or {}
    location_str = ", ".join(
        x for x in [location.get("city"), location.get("country")] if x
    )
    workplace = (item.get("remote") and "remote") or "onsite"
    return {
        "title": (item.get("title") or "").strip(),
        "company": company_slug,
        "description": _strip_html(item.get("description") or ""),
        "location": location_str,
        "remote_type": workplace,
        "apply_url": item.get("url") or item.get("application_url") or "",
        "posted_date": item.get("published_on") or item.get("created_at") or "",
        "source": "workable",
        "source_id": item.get("shortcode") or item.get("id") or "",
        "salary_min": None,
        "salary_max": None,
        "tech_stack": [],
        "employment_type": item.get("employment_type") or "",
    }


async def fetch_workable(
    company_slugs: list[str], *, timeout_s: float = 10.0,
) -> list[dict[str, Any]]:
    if os.getenv("STUB_JOBS_API", "0") == "1":
        log.info("STUB_JOBS_API=1 → returning Workable stub for %d slugs", len(company_slugs))
        return _stub_jobs("workable", company_slugs)

    out: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=timeout_s) as client:
        for slug in company_slugs:
            slug = slug.strip().lower()
            if not slug:
                continue
            try:
                r = await client.get(
                    WORKABLE_BOARD_URL.format(slug=slug),
                    headers={"User-Agent": "AppName-desktop/0.1"},
                )
                if r.status_code != 200:
                    log.warning("workable %s → %d", slug, r.status_code)
                    continue
                payload = r.json() or {}
                jobs = payload.get("results") or payload.get("jobs") or []
                for job in jobs:
                    out.append(_normalize_workable(job, slug))
            except Exception as exc:  # noqa: BLE001
                log.warning("workable fetch failed for %s: %s", slug, exc)
    return out
