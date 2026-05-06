"""Application configuration. Mode-aware (saas | desktop) per PRD v5.1 §14."""
from __future__ import annotations

import os
import secrets
from pathlib import Path
from typing import Literal

Mode = Literal["saas", "desktop"]

APPNAME_MODE: Mode = os.getenv("APPNAME_MODE", "saas")  # type: ignore[assignment]
if APPNAME_MODE not in ("saas", "desktop"):
    raise RuntimeError(f"APPNAME_MODE must be 'saas' or 'desktop', got {APPNAME_MODE!r}")

# SaaS mode — Supabase
SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")
SUPABASE_JWT_SECRET: str = os.getenv("SUPABASE_JWT_SECRET", "")

# Desktop mode — local SQLite
DESKTOP_DATA_DIR: Path = Path(
    os.getenv("APPNAME_DATA_DIR")
    or (Path.home() / ".appname")
).expanduser()
DESKTOP_DATA_DIR.mkdir(parents=True, exist_ok=True)
DESKTOP_DB_PATH: Path = DESKTOP_DATA_DIR / "data.db"

# Anthropic — server env in SaaS, user-provided settings row in desktop
ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")

# Internal cron secret (SaaS only — GitHub Actions hits /internal/* endpoints)
X_INTERNAL_SECRET: str = os.getenv("X_INTERNAL_SECRET", "")

# Local API token (desktop only — regenerated each launch)
LOCAL_API_TOKEN: str = secrets.token_hex(32)

# Dev / test toggles
STUB_ANTHROPIC: bool = os.getenv("STUB_ANTHROPIC", "0") == "1"
STUB_JOBS_API: bool = os.getenv("STUB_JOBS_API", "0") == "1"


def is_saas() -> bool:
    return APPNAME_MODE == "saas"


def is_desktop() -> bool:
    return APPNAME_MODE == "desktop"
