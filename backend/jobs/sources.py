"""Job source fetchers. Real APIs in production; fixture-backed in dev/test.

Stubbing is controlled by:
  - STUB_JOBS_API=1  → always return fixture data (no signups required)
  - JSEARCH_API_KEY  unset → return fixture data with a warning
  - JSEARCH_API_KEY  set   → real RapidAPI call

The shape returned to the pipeline is uniform regardless of source — see
`NormalizedLead`. Keep adapters thin: fetch + map → done.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

import httpx

log = logging.getLogger(__name__)

_FIXTURE_PATH = Path(__file__).parent / "fixtures" / "sample_jobs.json"
_JSEARCH_HOST = "jsearch.p.rapidapi.com"


def _normalize_jsearch(item: dict[str, Any]) -> dict[str, Any]:
    """Map a JSearch result row to our internal shape."""
    return {
        "title": (item.get("job_title") or "").strip(),
        "company": (item.get("employer_name") or "").strip(),
        "description": item.get("job_description") or "",
        "location": _location_string(item),
        "remote_type": "remote" if item.get("job_is_remote") else "onsite",
        "apply_url": item.get("job_apply_link") or "",
        "posted_date": item.get("job_posted_at_datetime_utc") or "",
        "source": "jsearch",
        "source_id": item.get("job_id") or "",
        "salary_min": item.get("job_min_salary"),
        "salary_max": item.get("job_max_salary"),
        "tech_stack": item.get("job_required_skills") or [],
        "employment_type": item.get("job_employment_type") or "",
    }


def _location_string(item: dict[str, Any]) -> str:
    parts = [item.get("job_city"), item.get("job_country")]
    return ", ".join(p for p in parts if p)


def _load_fixtures() -> list[dict[str, Any]]:
    raw = json.loads(_FIXTURE_PATH.read_text())
    return [_normalize_jsearch(item) for item in raw]


async def fetch_jsearch(query: str, num_pages: int = 1) -> list[dict[str, Any]]:
    """Fetch jobs from JSearch on RapidAPI. Falls back to fixtures when stubbed."""
    if os.getenv("STUB_JOBS_API", "0") == "1":
        log.info("STUB_JOBS_API=1 → returning fixture data for query=%r", query)
        return _load_fixtures()

    api_key = os.getenv("JSEARCH_API_KEY", "")
    if not api_key:
        log.warning("JSEARCH_API_KEY unset — returning fixture data for query=%r", query)
        return _load_fixtures()

    headers = {
        "x-rapidapi-key": api_key,
        "x-rapidapi-host": _JSEARCH_HOST,
    }
    params = {"query": query, "num_pages": str(num_pages)}

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.get(
                f"https://{_JSEARCH_HOST}/search",
                headers=headers,
                params=params,
            )
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPError as exc:
            log.error("JSearch fetch failed (%s) — falling back to fixtures", exc)
            return _load_fixtures()

    items = data.get("data") or []
    return [_normalize_jsearch(item) for item in items]


async def fetch_adzuna(what: str, country: str = "us") -> list[dict[str, Any]]:
    """Adzuna fallback. Stubbed for Phase 2 — wire real call when signed up."""
    log.info("fetch_adzuna stubbed — returning fixture data for what=%r", what)
    return _load_fixtures()
