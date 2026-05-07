"""Phase 10.4 — desktop source adapters.

Replaces JSearch (RapidAPI, $) with free public ATS job-board endpoints.
SaaS keeps JSearch + Adzuna; desktop uses these. The pipeline is the same —
quality_gate + scoring_engine run on output regardless of source.

Adapter contract: returns a list of dicts in the same NormalizedLead shape
as backend.jobs.sources._normalize_jsearch.

Attribution: free_scout patterns adapted from vasu-devs/justhireme (MIT).
See LICENSE-justhireme at repo root.
"""
from backend.agents.sources.greenhouse import fetch_greenhouse
from backend.agents.sources.lever import fetch_lever
from backend.agents.sources.ashby import fetch_ashby
from backend.agents.sources.workable import fetch_workable
from backend.agents.sources.orchestrator import fetch_all_sources

DEFAULT_GREENHOUSE_COMPANIES = [
    "openai", "anthropic", "stripe", "airtable", "vercel",
    "scale", "notion", "linear", "discord", "figma",
]
DEFAULT_LEVER_COMPANIES = [
    "netflix", "robinhood", "shopify", "twitch",
]
DEFAULT_ASHBY_COMPANIES = [
    "ramp", "linear",
]
DEFAULT_WORKABLE_COMPANIES = []  # opt-in only — slugs vary

__all__ = [
    "fetch_greenhouse",
    "fetch_lever",
    "fetch_ashby",
    "fetch_workable",
    "fetch_all_sources",
    "DEFAULT_GREENHOUSE_COMPANIES",
    "DEFAULT_LEVER_COMPANIES",
    "DEFAULT_ASHBY_COMPANIES",
    "DEFAULT_WORKABLE_COMPANIES",
]
