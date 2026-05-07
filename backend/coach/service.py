"""Phase 9 — Coach service helpers.

Pure functions. No I/O (storage calls happen at the endpoint layer).
"""
from __future__ import annotations

import re
import secrets
from typing import Any


# ── Validation ────────────────────────────────────────────────────────
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
HEX_COLOR_RE = re.compile(r"^#?[0-9A-Fa-f]{6}$")


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def is_valid_email(email: str) -> bool:
    return bool(EMAIL_RE.match(email or ""))


def is_valid_hex_color(value: str) -> bool:
    return bool(HEX_COLOR_RE.match(value or ""))


def normalize_hex_color(value: str) -> str:
    """Returns '#rrggbb' lowercased. Caller must pre-validate."""
    v = (value or "").strip().lower()
    return v if v.startswith("#") else f"#{v}"


# ── Invite tokens ─────────────────────────────────────────────────────
def new_invite_token() -> str:
    """URL-safe, 32 bytes of randomness. Stored in coach_clients.invite_token."""
    return secrets.token_urlsafe(32)


# ── White-label PDF wrapper ──────────────────────────────────────────
def inject_branding(
    base_html: str,
    *,
    logo_url: str | None,
    brand_color: str | None,
) -> str:
    """Inject coach branding into a tailor-rendered HTML document.

    - Replaces the accent color in the existing <style> block with the coach's
      brand color (when given).
    - Prepends a small header band with the coach logo (when given).

    If both args are None, returns base_html unchanged. The function is a no-op
    if base_html doesn't look like our resume HTML (defensive: don't break the
    pipeline if a future caller hands us a different document).
    """
    if not logo_url and not brand_color:
        return base_html
    if "<body>" not in base_html:
        return base_html

    out = base_html

    # 1) Color override — find the brand color references and swap them.
    # Our renderer always uses '#5B21B6' as the accent. A pure string replace is
    # the cheapest correct path here.
    if brand_color and is_valid_hex_color(brand_color):
        normalized = normalize_hex_color(brand_color)
        out = out.replace("#5B21B6", normalized)

    # 2) Logo header band — inject right after <body>.
    if logo_url:
        # Inline tiny CSS to keep the band ATS-safe (still single-column flow).
        band = (
            '<div style="margin: -0.6in -0.6in 14pt -0.6in; padding: 12pt 0.6in; '
            'border-bottom: 2pt solid {color}; text-align: right;">'
            '<img src="{src}" alt="" style="height: 28pt; max-width: 200pt; '
            'object-fit: contain;"/></div>'
        ).format(
            color=normalize_hex_color(brand_color) if brand_color else "#5B21B6",
            src=logo_url,
        )
        out = out.replace("<body>", f"<body>{band}", 1)

    return out


# ── Bulk-tailor result aggregation ───────────────────────────────────
def summarize_bulk_results(results: list[dict[str, Any]]) -> dict[str, Any]:
    """Flatten a list of per-client tailor outcomes into a summary."""
    succeeded = [r for r in results if r.get("ok")]
    failed = [r for r in results if not r.get("ok")]
    return {
        "total": len(results),
        "succeeded": len(succeeded),
        "failed": len(failed),
        "results": results,
    }
