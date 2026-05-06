"""Job tagger. Uses Claude Haiku to extract structured tags from a JD.

Output shape: { field, level, tech_stack[], remote_type }

Real Anthropic call when ANTHROPIC_API_KEY is set and STUB_ANTHROPIC=0.
Otherwise: deterministic heuristic tagger so dev works with no signups.
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

log = logging.getLogger(__name__)

# 8 canonical job fields from PRD
FIELDS = (
    "Engineering",
    "Data",
    "Design",
    "Product",
    "Marketing",
    "Sales",
    "Operations",
    "Technical Account Manager",
)

LEVELS = ("intern", "junior", "mid", "senior", "lead", "principal")


_FIELD_HINTS = {
    # Order matters — first match wins. Specific roles before generic.
    "Technical Account Manager": ("technical account manager", "tam ", "solutions engineer", "customer engineer", "sales engineer"),
    "Data": ("data engineer", "data scientist", "ml engineer", "machine learning", "analytics engineer", "data analyst"),
    "Design": ("designer", "product design", "brand design", "ux", "ui designer"),
    "Product": ("product manager", "pm ", "product owner", "product lead", "growth pm"),
    "Marketing": ("marketing", "growth marketing", "content marketing", "seo"),
    "Sales": ("sales", "account executive", "ae ", "bdr", "sdr", "business development"),
    "Operations": ("operations", "ops ", "biz ops", "people ops", "revops"),
    "Engineering": ("engineer", "developer", "swe", "frontend", "backend", "fullstack", "full-stack", "devops", "sre", "mobile", "ios", "android"),
}

_LEVEL_HINTS = {
    "intern":    ("intern ", "internship", "trainee"),
    "junior":    ("junior", "jr ", "jr.", "entry level", "entry-level", "new grad", "graduate"),
    "mid":       ("mid-level", "mid level", "intermediate", " ii ", " 2 "),
    "senior":    ("senior", "sr ", "sr.", " iii", "5+ years", "5 years"),
    "lead":      ("lead engineer", "tech lead", "engineering manager", "team lead"),
    "principal": ("principal", "staff engineer", "staff ", "architect", "director"),
}


def _heuristic_tag(title: str, description: str) -> dict[str, Any]:
    """Deterministic fallback tagger — used when Anthropic is unavailable."""
    blob = f"{title} {description}".lower()

    field = "Engineering"
    for f, hints in _FIELD_HINTS.items():
        if any(h in blob for h in hints):
            field = f
            break

    level = "mid"
    for l, hints in _LEVEL_HINTS.items():
        if any(h in blob for h in hints):
            level = l
            break

    # crude tech_stack — pull capitalized tokens that look like tech
    tech_stack: list[str] = []
    for token in re.findall(r"\b[A-Z][a-zA-Z0-9.+#]{1,18}\b", title + " " + description):
        if token in tech_stack or len(token) < 2:
            continue
        if token.lower() in {"the", "and", "for", "with", "this"}:
            continue
        tech_stack.append(token)
        if len(tech_stack) >= 8:
            break

    remote_type = "remote" if "remote" in blob else "onsite"
    return {
        "field": field,
        "level": level,
        "tech_stack": tech_stack,
        "remote_type": remote_type,
    }


_TAGGER_PROMPT = """You tag a job posting with structured metadata.

Return ONLY JSON matching this shape:
{
  "field": one of [Engineering, Data, Design, Product, Marketing, Sales, Operations, Technical Account Manager],
  "level": one of [intern, junior, mid, senior, lead, principal],
  "tech_stack": [up to 8 specific technologies/tools mentioned in the JD],
  "remote_type": one of [remote, onsite, hybrid]
}

JD:
"""


async def tag_job(title: str, description: str) -> dict[str, Any]:
    """Tag a job. Falls back to heuristic when Anthropic is stubbed/unavailable.

    Cost: ~150 tokens in + ~80 tokens out per call on Haiku ≈ $0.0001.
    Cap upstream by gating with quality_gate + scoring_engine before calling this.
    """
    if os.getenv("STUB_ANTHROPIC", "0") == "1":
        return _heuristic_tag(title, description)

    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        log.info("ANTHROPIC_API_KEY unset — using heuristic tagger")
        return _heuristic_tag(title, description)

    try:
        from anthropic import AsyncAnthropic
    except ImportError:
        log.warning("anthropic package not installed — using heuristic tagger")
        return _heuristic_tag(title, description)

    try:
        client = AsyncAnthropic(api_key=api_key)
        msg = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            messages=[
                {
                    "role": "user",
                    "content": _TAGGER_PROMPT + f"Title: {title}\n\n{description[:3000]}",
                }
            ],
        )
        text = msg.content[0].text  # type: ignore[union-attr]
        # Strip ```json fences if present
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.M)
        data = json.loads(text)
    except Exception as exc:  # noqa: BLE001
        log.warning("Haiku tagger failed (%s) — falling back to heuristic", exc)
        return _heuristic_tag(title, description)

    # Validate shape — fall back to heuristic if model misbehaves
    if (
        data.get("field") in FIELDS
        and data.get("level") in LEVELS
        and isinstance(data.get("tech_stack"), list)
        and data.get("remote_type") in ("remote", "onsite", "hybrid")
    ):
        return data
    log.warning("Haiku returned malformed tags %r — falling back", data)
    return _heuristic_tag(title, description)
