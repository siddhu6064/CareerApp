"""Resend email integration. Stubbed when RESEND_API_KEY is unset or
STUB_RESEND=1 — same shape returned, no network call. The stub captures
sends in an in-memory list so tests can assert on them.

Resend docs: https://resend.com/docs/api-reference/emails/send-email
"""
from __future__ import annotations

import html
import logging
import os
from typing import Any

import httpx

log = logging.getLogger(__name__)


# Captured in stub mode; cleared between tests via reset_email_outbox().
_STUB_OUTBOX: list[dict[str, Any]] = []


def reset_email_outbox() -> None:
    _STUB_OUTBOX.clear()


def get_email_outbox() -> list[dict[str, Any]]:
    return list(_STUB_OUTBOX)


def _is_stubbed() -> bool:
    return os.getenv("STUB_RESEND", "0") == "1" or not os.getenv("RESEND_API_KEY")


async def send_email(
    *,
    to: str,
    subject: str,
    html_body: str,
    text_body: str | None = None,
    from_addr: str | None = None,
) -> dict[str, Any]:
    """Returns a dict that mimics Resend's response: {id, ...}.

    In stub mode returns {"id": "stub_<n>", "stubbed": True} and appends to
    the outbox. In live mode posts to https://api.resend.com/emails.
    """
    sender = from_addr or os.getenv("RESEND_FROM", "AppName <digest@appname.app>")

    if _is_stubbed():
        rec = {
            "to": to,
            "from": sender,
            "subject": subject,
            "html": html_body,
            "text": text_body or "",
        }
        _STUB_OUTBOX.append(rec)
        return {"id": f"stub_{len(_STUB_OUTBOX)}", "stubbed": True}

    api_key = os.getenv("RESEND_API_KEY", "")
    payload: dict[str, Any] = {
        "from": sender,
        "to": [to],
        "subject": subject,
        "html": html_body,
    }
    if text_body:
        payload["text"] = text_body

    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        if r.status_code >= 400:
            log.warning("Resend send failed: %s %s", r.status_code, r.text)
            r.raise_for_status()
        return r.json()


# ──────────────────────────────────────────────────────────────────────
# Digest HTML rendering
# ──────────────────────────────────────────────────────────────────────
def _format_salary(job: dict[str, Any]) -> str | None:
    lo, hi = job.get("salary_min"), job.get("salary_max")
    if lo and hi:
        return f"${lo // 1000}k–${hi // 1000}k"
    return None


def render_digest_html(
    *,
    user_email: str,
    plan: str,
    jobs: list[dict[str, Any]],
    web_base_url: str,
) -> tuple[str, str]:
    """Return (subject, html). Free tier hides ATS%, Pro+ shows it.

    The Pro/ATS distinction is implemented by NOT rendering an `ats_score`
    line for Free; this is the daily-digest gate.
    """
    n = len(jobs)
    subject = f"{n} new role{'s' if n != 1 else ''} for you" if n else "Your daily digest"

    show_ats = plan in ("pro", "coach")

    # Inline styles only — many email clients strip <style>.
    BRAND = "#5B21B6"
    BRAND_BG = "#EDE9FE"
    INK = "#111827"
    INK_SOFT = "#4B5563"
    BORDER = "#E5E7EB"

    rows: list[str] = []
    if not jobs:
        rows.append(
            f'<tr><td style="padding:24px;text-align:center;color:{INK_SOFT};">'
            "No new roles match your filters today. We'll keep looking."
            "</td></tr>"
        )
    else:
        for j in jobs:
            title = html.escape(j.get("title") or "Role")
            company = html.escape(j.get("company") or "")
            loc = html.escape(j.get("location") or "")
            salary = _format_salary(j)
            url = f"{web_base_url}/jobs/{html.escape(j.get('id') or '')}"

            badges_parts: list[str] = []
            if j.get("field"):
                badges_parts.append(
                    f'<span style="background:{BRAND_BG};color:{BRAND};padding:2px 8px;'
                    f'border-radius:999px;font-size:11px;font-weight:600;'
                    f'text-transform:uppercase;letter-spacing:0.4px;">'
                    f'{html.escape(j["field"])}</span>'
                )
            if j.get("level") and j["level"] != "any":
                badges_parts.append(
                    f'<span style="background:#DBEAFE;color:#1E40AF;padding:2px 8px;'
                    f'border-radius:999px;font-size:11px;font-weight:600;'
                    f'text-transform:uppercase;letter-spacing:0.4px;">'
                    f'{html.escape(j["level"])}</span>'
                )
            if salary:
                badges_parts.append(
                    f'<span style="background:#D1FAE5;color:#065F46;padding:2px 8px;'
                    f'border-radius:999px;font-size:11px;font-weight:600;'
                    f'text-transform:uppercase;letter-spacing:0.4px;">'
                    f'{html.escape(salary)}</span>'
                )

            ats_line = ""
            if show_ats and j.get("quality_score") is not None:
                ats_line = (
                    f'<div style="margin-top:8px;color:{INK_SOFT};font-size:12px;">'
                    f'Match quality: <strong style="color:{BRAND};">'
                    f'{int(j["quality_score"])}/100</strong>'
                    "</div>"
                )

            rows.append(
                f'<tr><td style="padding:16px 24px;border-bottom:1px solid {BORDER};">'
                f'<a href="{url}" style="text-decoration:none;color:{INK};">'
                f'<div style="font-weight:600;font-size:16px;color:{INK};">{title}</div>'
                f'<div style="color:{INK_SOFT};font-size:13px;margin-top:2px;">'
                f'{company}{(" · " + loc) if loc else ""}</div>'
                f'<div style="margin-top:8px;">{" ".join(badges_parts)}</div>'
                f"{ats_line}"
                "</a></td></tr>"
            )

    upgrade_block = ""
    if not show_ats:
        upgrade_block = (
            f'<div style="background:{BRAND_BG};padding:16px 24px;border-radius:8px;'
            f'margin-top:16px;color:{INK};font-size:13px;text-align:center;">'
            f'See <strong>match quality scores</strong> and unlock unlimited tailoring '
            f'with <a href="{web_base_url}/upgrade" style="color:{BRAND};font-weight:600;">'
            'Pro</a> ($19/mo).</div>'
        )

    body = f"""\
<!DOCTYPE html>
<html><body style="margin:0;background:#F9FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0"
           style="max-width:600px;background:#fff;border:1px solid {BORDER};border-radius:12px;overflow:hidden;">
      <tr><td style="padding:24px 24px 8px;">
        <div style="font-size:20px;font-weight:700;color:{BRAND};">AppName</div>
        <div style="color:{INK_SOFT};font-size:13px;margin-top:4px;">Your daily digest · {n} role{"s" if n != 1 else ""}</div>
      </td></tr>
      {"".join(rows)}
      <tr><td style="padding:16px 24px;background:#F9FAFB;color:{INK_SOFT};font-size:12px;">
        {upgrade_block}
        <div style="margin-top:16px;text-align:center;">
          <a href="{web_base_url}/settings" style="color:{INK_SOFT};">Settings</a> ·
          <a href="{web_base_url}/settings#unsubscribe" style="color:{INK_SOFT};">Unsubscribe</a>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>
"""

    return subject, body


def render_digest_text(*, jobs: list[dict[str, Any]], web_base_url: str) -> str:
    """Plaintext fallback for clients that don't render HTML."""
    if not jobs:
        return "No new roles match your filters today.\n\n— AppName"
    out = ["Your daily AppName digest", ""]
    for j in jobs:
        title = j.get("title") or "Role"
        company = j.get("company") or ""
        url = f"{web_base_url}/jobs/{j.get('id') or ''}"
        line = f"• {title} @ {company}"
        sal = _format_salary(j)
        if sal:
            line += f" — {sal}"
        out.append(line)
        out.append(f"  {url}")
        out.append("")
    out.append("— AppName")
    return "\n".join(out)
