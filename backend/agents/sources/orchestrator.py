"""Phase 10.4 — Source orchestrator.

Reads per-source slug config from the SQLite settings table (settings keys
prefixed `sources.`), fans out parallel fetches via asyncio.gather, returns
a flat list of NormalizedLeads ready for the existing pipeline (quality_gate
+ scoring + Haiku tagging).

Settings keys:
    sources.greenhouse  → "openai,anthropic,stripe,..."
    sources.lever       → "netflix,robinhood,..."
    sources.ashby       → "ramp,linear"
    sources.workable    → ""      (opt-in)

Defaults supplied in __init__.py if a key is unset on first launch.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from backend.agents.sources.ashby import fetch_ashby
from backend.agents.sources.greenhouse import fetch_greenhouse
from backend.agents.sources.lever import fetch_lever
from backend.agents.sources.workable import fetch_workable

log = logging.getLogger(__name__)


_KEY_PREFIX = "sources."

SOURCES: list[tuple[str, callable]] = [  # type: ignore[type-arg]
    ("greenhouse", fetch_greenhouse),
    ("lever", fetch_lever),
    ("ashby", fetch_ashby),
    ("workable", fetch_workable),
]


def _split_slugs(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [s.strip().lower() for s in raw.split(",") if s.strip()]


async def _slugs_for(storage: Any, source: str, default: list[str]) -> list[str]:
    """Read slug list from settings, falling back to defaults."""
    try:
        raw = await storage.get_setting(f"{_KEY_PREFIX}{source}")
    except Exception:  # noqa: BLE001
        raw = None
    if raw is None:
        return list(default)
    return _split_slugs(raw)


async def fetch_all_sources(
    storage: Any, *, defaults: dict[str, list[str]] | None = None,
) -> list[dict[str, Any]]:
    """Run every configured source in parallel; return the merged lead list.

    `defaults` is a dict of {source_name: [slug, ...]} used when a settings
    key is unset (typical first-launch case). The defaults map exposed in
    backend.agents.sources.__init__ should be passed in by the caller.
    """
    from backend.agents.sources import (
        DEFAULT_ASHBY_COMPANIES,
        DEFAULT_GREENHOUSE_COMPANIES,
        DEFAULT_LEVER_COMPANIES,
        DEFAULT_WORKABLE_COMPANIES,
    )
    defaults = defaults or {
        "greenhouse": DEFAULT_GREENHOUSE_COMPANIES,
        "lever": DEFAULT_LEVER_COMPANIES,
        "ashby": DEFAULT_ASHBY_COMPANIES,
        "workable": DEFAULT_WORKABLE_COMPANIES,
    }

    coros = []
    for name, fetch_fn in SOURCES:
        slugs = await _slugs_for(storage, name, defaults.get(name, []))
        if not slugs:
            continue
        coros.append(fetch_fn(slugs))

    if not coros:
        log.info("no source slugs configured — returning empty lead list")
        return []

    chunks = await asyncio.gather(*coros, return_exceptions=True)
    out: list[dict[str, Any]] = []
    for chunk in chunks:
        if isinstance(chunk, Exception):
            log.warning("source fetch raised: %s", chunk)
            continue
        out.extend(chunk)
    return out
