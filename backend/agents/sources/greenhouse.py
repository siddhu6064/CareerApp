"""Greenhouse public job-board adapter.

API: https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true

No auth. Free. Stable. Most YC + tech companies use Greenhouse.

Stub mode: STUB_JOBS_API=1 → returns the same fixture data the JSearch path
uses (re-tagged source='greenhouse' for traceability), so end-to-end tests
work without network.
"""
from __future__ import annotations

import logging
import os
import re
from html.parser import HTMLParser
from typing import Any

import httpx

log = logging.getLogger(__name__)

GREENHOUSE_BOARDS_URL = "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"


class _StripTags(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._buf: list[str] = []

    def handle_data(self, data: str) -> None:
        self._buf.append(data)

    @property
    def text(self) -> str:
        return "".join(self._buf)


def _strip_html(html: str) -> str:
    """Greenhouse returns HTML in `content`; we want plain text for ATS scoring."""
    if not html:
        return ""
    p = _StripTags()
    try:
        p.feed(html)
    except Exception:  # noqa: BLE001 — defensive on malformed HTML
        return re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", p.text).strip()


def _is_remote(item: dict[str, Any]) -> str:
    """Best-effort remote/hybrid/onsite from Greenhouse offices field."""
    offices = item.get("offices") or []
    location = (item.get("location") or {}).get("name") or ""
    name_blob = " ".join(o.get("name", "") for o in offices) + " " + location
    name_blob = name_blob.lower()
    if "remote" in name_blob:
        return "remote"
    if "hybrid" in name_blob:
        return "hybrid"
    return "onsite"


def _normalize_greenhouse(item: dict[str, Any], company_slug: str) -> dict[str, Any]:
    return {
        "title": (item.get("title") or "").strip(),
        "company": company_slug,  # caller can override with the prettified name
        "description": _strip_html(item.get("content") or ""),
        "location": (item.get("location") or {}).get("name") or "",
        "remote_type": _is_remote(item),
        "apply_url": item.get("absolute_url") or "",
        "posted_date": item.get("updated_at") or "",
        "source": "greenhouse",
        "source_id": str(item.get("id") or ""),
        "salary_min": None,  # Greenhouse public API doesn't expose salary
        "salary_max": None,
        "tech_stack": [],     # extracted later by Haiku tagger
        "employment_type": "",
    }


async def fetch_greenhouse(
    company_slugs: list[str], *, timeout_s: float = 10.0,
) -> list[dict[str, Any]]:
    """Fetch jobs from one or more Greenhouse boards. Errors per-board are
    logged and skipped so one bad slug doesn't kill the batch.
    """
    if os.getenv("STUB_JOBS_API", "0") == "1":
        log.info("STUB_JOBS_API=1 → returning Greenhouse stub for %d slugs", len(company_slugs))
        return _stub_jobs("greenhouse", company_slugs)

    out: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=timeout_s) as client:
        for slug in company_slugs:
            slug = slug.strip().lower()
            if not slug:
                continue
            try:
                r = await client.get(
                    GREENHOUSE_BOARDS_URL.format(slug=slug),
                    params={"content": "true"},
                    headers={"User-Agent": "AppName-desktop/0.1"},
                )
                if r.status_code != 200:
                    log.warning("greenhouse %s → %d", slug, r.status_code)
                    continue
                payload = r.json()
                jobs = payload.get("jobs") or []
                for job in jobs:
                    out.append(_normalize_greenhouse(job, slug))
            except Exception as exc:  # noqa: BLE001
                log.warning("greenhouse fetch failed for %s: %s", slug, exc)
    return out


def _stub_jobs(source: str, slugs: list[str]) -> list[dict[str, Any]]:
    """Reuse the JSearch fixture set with the source tag rewritten."""
    from backend.jobs.sources import _load_fixtures
    out = _load_fixtures()
    for i, item in enumerate(out):
        item["source"] = source
        if slugs:
            item["company"] = slugs[i % len(slugs)]
    return out
