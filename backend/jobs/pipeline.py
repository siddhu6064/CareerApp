"""Job ingestion pipeline. Runs daily via /internal/jobs/fetch.

Pipeline stages (in order):
  1. Fetch from sources (JSearch primary, Adzuna fallback)
  2. Quality gate (JustHireMe port — drops red-flag/low-signal rows)
  3. Deterministic scoring (JustHireMe port — pre-Haiku filter)
  4. Haiku tagging (only on rows that passed quality gate)
  5. Dedup by job_hash
  6. Upsert into storage adapter

Cost optimization: stages 2 + 3 reduce Haiku token spend by ~30-50% by
filtering garbage before any LLM call. PRD v5.1 §16 credit.
"""
from __future__ import annotations

import hashlib
import logging
from typing import Any

from backend.agents.justhireme.lead_intel import lead_id
from backend.agents.justhireme.quality_gate import (
    MIN_DEFAULT_QUALITY,
    evaluate_lead_quality,
)
from backend.jobs.cache import job_feed_cache
from backend.jobs.sources import fetch_adzuna, fetch_jsearch
from backend.jobs.tagger import tag_job
from backend.storage import StorageAdapter

log = logging.getLogger(__name__)


def compute_job_hash(title: str, company: str, posted_date: str) -> str:
    """Stable dedup key. PRD §14 Phase 2: sha256(title+company+posted_date)[:16]."""
    payload = f"{title.strip().lower()}|{company.strip().lower()}|{posted_date.strip()}"
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


def _quality_lead_shape(lead: dict[str, Any]) -> dict[str, Any]:
    """Map our normalized lead shape to the keys quality_gate expects."""
    return {
        "title": lead.get("title", ""),
        "company": lead.get("company", ""),
        "platform": lead.get("source", ""),
        "url": lead.get("apply_url", ""),  # required — quality_gate rejects rows without
        "description": lead.get("description", ""),
        "location": lead.get("location", ""),
        "posted_date": lead.get("posted_date", ""),
        "source_meta": {
            "tech_stack": lead.get("tech_stack", []),
        },
    }


async def run_ingestion(
    storage: StorageAdapter,
    queries: list[str],
    quality_threshold: int = 20,  # noqa: ARG001 — JH's MIN_DEFAULT_QUALITY=60 is biased toward beginner dev feed; we want spam filter only
) -> dict[str, int]:
    """Full pipeline. Returns counters: { fetched, gated, tagged, inserted, skipped }.

    Note on threshold: JustHireMe's quality_gate is tuned for a beginner-dev
    feed (target_level=beginner, MIN_DEFAULT_QUALITY=60). We override with
    target_level=any (multi-persona) and a lower threshold (20) — our goal is
    to filter SPAM (score 0 from red flags), not to filter senior or
    non-engineering roles. Per-user fit scoring is Phase 5's job.

    Mode behavior:
    - SaaS: JSearch primary, Adzuna fallback, looped per query.
    - Desktop: skip JSearch + Adzuna entirely. Fan out to Greenhouse + Lever +
      Ashby + Workable boards configured under settings keys (sources.*).
      Queries are ignored — we fetch every job from every configured board.
    """
    from backend import config

    counters = {"fetched": 0, "gated": 0, "tagged": 0, "inserted": 0, "skipped": 0}

    if config.is_desktop():
        # Phase 10.4: free public ATS boards instead of $JSearch.
        from backend.agents.sources import fetch_all_sources
        leads = await fetch_all_sources(storage)
        await _process_lead_batch(storage, leads, counters, quality_threshold)
    else:
        for query in queries:
            leads = await fetch_jsearch(query)
            if not leads:
                log.info("JSearch empty for %r — trying Adzuna", query)
                leads = await fetch_adzuna(query)
            await _process_lead_batch(storage, leads, counters, quality_threshold)

    # Invalidate feed cache so users see fresh jobs immediately
    job_feed_cache.clear()
    log.info("ingestion complete: %s", counters)
    return counters


async def _process_lead_batch(
    storage: StorageAdapter,
    leads: list[dict[str, Any]],
    counters: dict[str, int],
    quality_threshold: int,
) -> None:
    """Quality-gate, tag, dedup, upsert each lead. Mutates `counters` in place."""
    counters["fetched"] += len(leads)
    for lead in leads:
        # ── Stage 1: quality gate (spam filter, persona-agnostic) ────
        quality = evaluate_lead_quality(
            _quality_lead_shape(lead),
            target_level="any",
            min_quality=quality_threshold,
        )
        if not quality["accepted"]:
            counters["skipped"] += 1
            log.debug(
                "skip lead %r — score=%d reason=%s",
                lead.get("title"),
                quality["score"],
                quality.get("reason"),
            )
            continue
        counters["gated"] += 1

        # ── Stage 2: tag with Haiku (or heuristic stub) ──────────────
        tags = await tag_job(lead["title"], lead["description"])
        counters["tagged"] += 1

        # ── Stage 3: dedup + upsert ──────────────────────────────────
        job_hash = compute_job_hash(
            lead["title"], lead["company"], lead.get("posted_date", "")
        )
        job_id = lead_id("job", job_hash)

        await storage.upsert_job(
            {
                "id": job_id,
                "job_hash": job_hash,
                "title": lead["title"],
                "company": lead["company"],
                "location": lead.get("location"),
                # Source API knows authoritatively (job_is_remote flag);
                # heuristic tag is only a fallback when source didn't provide it.
                "remote_type": lead.get("remote_type") or tags["remote_type"],
                "field": tags["field"],
                "level": tags["level"],
                "tech_stack": tags["tech_stack"] or lead.get("tech_stack", []),
                "jd_raw": lead["description"],
                "apply_url": lead["apply_url"],
                "posted_date": lead.get("posted_date"),
                "source": lead.get("source", "jsearch"),
                "quality_score": quality["score"],
                "salary_min": lead.get("salary_min"),
                "salary_max": lead.get("salary_max"),
            }
        )
        counters["inserted"] += 1
