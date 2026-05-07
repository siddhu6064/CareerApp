"""Lever public job-postings adapter.

API: https://api.lever.co/v0/postings/{slug}?mode=json

No auth. Free.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from backend.agents.sources.greenhouse import _stub_jobs

log = logging.getLogger(__name__)

LEVER_POSTINGS_URL = "https://api.lever.co/v0/postings/{slug}"


def _normalize_lever(item: dict[str, Any], company_slug: str) -> dict[str, Any]:
    cats = item.get("categories") or {}
    location = cats.get("location") or ""
    commitment = cats.get("commitment") or ""
    workplace = (item.get("workplaceType") or "").lower()
    if workplace == "remote" or "remote" in location.lower():
        remote_type = "remote"
    elif workplace == "hybrid":
        remote_type = "hybrid"
    else:
        remote_type = "onsite"
    descr = item.get("descriptionPlain") or item.get("description") or ""
    return {
        "title": (item.get("text") or "").strip(),
        "company": company_slug,
        "description": descr,
        "location": location,
        "remote_type": remote_type,
        "apply_url": item.get("hostedUrl") or item.get("applyUrl") or "",
        "posted_date": "",  # Lever returns createdAt as epoch ms — left empty for simplicity
        "source": "lever",
        "source_id": item.get("id") or "",
        "salary_min": None,
        "salary_max": None,
        "tech_stack": [],
        "employment_type": commitment,
    }


async def fetch_lever(
    company_slugs: list[str], *, timeout_s: float = 10.0,
) -> list[dict[str, Any]]:
    if os.getenv("STUB_JOBS_API", "0") == "1":
        log.info("STUB_JOBS_API=1 → returning Lever stub for %d slugs", len(company_slugs))
        return _stub_jobs("lever", company_slugs)

    out: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=timeout_s) as client:
        for slug in company_slugs:
            slug = slug.strip().lower()
            if not slug:
                continue
            try:
                r = await client.get(
                    LEVER_POSTINGS_URL.format(slug=slug),
                    params={"mode": "json"},
                    headers={"User-Agent": "AppName-desktop/0.1"},
                )
                if r.status_code != 200:
                    log.warning("lever %s → %d", slug, r.status_code)
                    continue
                jobs = r.json() or []
                for job in jobs:
                    out.append(_normalize_lever(job, slug))
            except Exception as exc:  # noqa: BLE001
                log.warning("lever fetch failed for %s: %s", slug, exc)
    return out
