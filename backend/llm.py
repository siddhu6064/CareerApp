"""LLM client helpers — BYOK in desktop mode, env vars in SaaS.

In desktop mode, the user provides their own Anthropic API key via the
Settings UI. The key is stored in the local SQLite `settings` table (and
optionally the OS keychain via Tauri secure storage). At runtime, we read
from settings first, then fall back to env vars.

In SaaS mode, only env vars are consulted. The settings table is unused.

This module is the single hook every Anthropic-callsite must go through.
Direct `os.getenv("ANTHROPIC_API_KEY")` calls are deprecated; existing call
sites still work but should migrate to `get_anthropic_api_key()`.
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

from backend import config

log = logging.getLogger(__name__)


# Settings table keys — kept in one place to avoid drift.
SETTINGS_KEY_ANTHROPIC = "anthropic_api_key"
SETTINGS_KEY_GITHUB = "github_token"


async def get_anthropic_api_key(storage: Any | None = None) -> str:
    """Return the active Anthropic key.

    Resolution order in desktop mode:
        1. ENV var (lets devs override without touching SQLite)
        2. settings table (BYOK from the Settings UI)
        3. empty string (caller is responsible for stubbing)

    SaaS mode just reads ENV.
    """
    env_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if env_key:
        return env_key

    if config.is_desktop() and storage is not None:
        try:
            stored = await storage.get_setting(SETTINGS_KEY_ANTHROPIC)
            if stored:
                return stored.strip()
        except Exception as exc:  # noqa: BLE001 — never crash on missing setting
            log.warning("Failed to read anthropic key from settings: %s", exc)

    return ""


async def get_github_token(storage: Any | None = None) -> str:
    """Same pattern as anthropic — used by the github_ingestor source adapter."""
    env_key = os.getenv("GITHUB_TOKEN", "").strip()
    if env_key:
        return env_key
    if config.is_desktop() and storage is not None:
        try:
            stored = await storage.get_setting(SETTINGS_KEY_GITHUB)
            if stored:
                return stored.strip()
        except Exception as exc:  # noqa: BLE001
            log.warning("Failed to read github token from settings: %s", exc)
    return ""


async def validate_anthropic_key(api_key: str, *, timeout_s: float = 10.0) -> dict[str, Any]:
    """Ping Anthropic with a 1-token request to confirm the key works.

    Returns: {ok: bool, model: str | None, error: str | None}.

    Cheap (< $0.0001 per call). Used by the Settings → 'Validate keys'
    button so users get fast feedback when they paste a bad key.
    """
    if not api_key or not api_key.strip():
        return {"ok": False, "model": None, "error": "key is empty"}

    if os.getenv("STUB_ANTHROPIC", "0") == "1":
        # Match the stub behavior of the rest of the AI surface.
        return {"ok": True, "model": "stub", "error": None}

    try:
        import anthropic  # imported lazily so the desktop bundle stays small
    except ImportError:
        return {"ok": False, "model": None, "error": "anthropic SDK not installed"}

    def _call() -> dict[str, Any]:
        client = anthropic.Anthropic(api_key=api_key.strip(), timeout=timeout_s)
        try:
            msg = client.messages.create(
                model="claude-haiku-4-5",
                max_tokens=1,
                messages=[{"role": "user", "content": "hi"}],
            )
            return {"ok": True, "model": msg.model, "error": None}
        except anthropic.AuthenticationError:
            return {"ok": False, "model": None, "error": "invalid API key"}
        except anthropic.RateLimitError as e:
            return {"ok": False, "model": None, "error": f"rate limited: {e}"}
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "model": None, "error": str(e)}

    return await asyncio.to_thread(_call)


async def validate_github_token(token: str, *, timeout_s: float = 8.0) -> dict[str, Any]:
    """Ping the GitHub /user endpoint to confirm the token works."""
    if not token or not token.strip():
        return {"ok": False, "login": None, "error": "token is empty"}

    import httpx
    try:
        async with httpx.AsyncClient(timeout=timeout_s) as c:
            r = await c.get(
                "https://api.github.com/user",
                headers={
                    "Authorization": f"Bearer {token.strip()}",
                    "Accept": "application/vnd.github+json",
                },
            )
        if r.status_code == 200:
            return {"ok": True, "login": r.json().get("login"), "error": None}
        if r.status_code == 401:
            return {"ok": False, "login": None, "error": "invalid token"}
        return {"ok": False, "login": None, "error": f"github returned {r.status_code}"}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "login": None, "error": str(e)}
