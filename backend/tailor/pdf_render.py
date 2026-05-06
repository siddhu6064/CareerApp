"""PDF generation. WeasyPrint server-side per PRD §7.

WeasyPrint requires native libs (Pango, Cairo, gdk-pixbuf). When unavailable
(dev box without system deps), we fall back to writing standalone HTML so the
pipeline never blocks on infrastructure. Production hosts must install:

  Debian/Ubuntu: apt-get install libpango-1.0-0 libpangoft2-1.0-0
  Render image:  add to Dockerfile

The HTML template is intentionally simple, ATS-friendly (no two-column tricks,
no embedded fonts, no images). ATS parsers struggle with fancy layouts.
"""
from __future__ import annotations

import html as _html
import logging
from typing import Any

log = logging.getLogger(__name__)


def _esc(value: Any) -> str:
    return _html.escape(str(value or ""))


def render_resume_html(
    contact_info: dict[str, Any],
    tailored: dict[str, Any],
    *,
    accent_hex: str = "#5B21B6",
) -> str:
    """Build a single-file HTML document of the tailored resume."""
    name = _esc(contact_info.get("name") or "Resume")
    contact_bits = [
        contact_info.get("email"),
        contact_info.get("phone"),
        contact_info.get("location"),
        contact_info.get("linkedin"),
        contact_info.get("github"),
        contact_info.get("website"),
    ]
    contact_line = " · ".join(_esc(b) for b in contact_bits if b)

    summary = _esc(tailored.get("summary") or "")

    exp_html = ""
    for e in tailored.get("experience") or []:
        bullets = "".join(f"<li>{_esc(b)}</li>" for b in (e.get("bullets") or []))
        exp_html += f"""
        <div class="role">
          <div class="role-head">
            <strong>{_esc(e.get('role'))}</strong> · {_esc(e.get('company'))}
            <span class="period">{_esc(e.get('period'))}</span>
          </div>
          {f'<div class="loc">{_esc(e.get("location"))}</div>' if e.get('location') else ''}
          <ul>{bullets}</ul>
        </div>"""

    skills_html = ", ".join(_esc(s) for s in (tailored.get("skills") or []))
    projects_html = ""
    if tailored.get("selected_projects"):
        items = "".join(f"<li>{_esc(p)}</li>" for p in tailored["selected_projects"])
        projects_html = f"<section><h2>Selected Projects</h2><ul>{items}</ul></section>"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>{name}</title>
<style>
  @page {{ size: Letter; margin: 0.6in; }}
  body {{ font-family: 'Helvetica', 'Arial', sans-serif; color: #111827; font-size: 10.5pt; line-height: 1.4; }}
  h1 {{ font-size: 22pt; margin: 0 0 4pt; color: {accent_hex}; }}
  h2 {{ font-size: 11pt; margin: 14pt 0 6pt; color: {accent_hex}; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid {accent_hex}; padding-bottom: 2pt; }}
  .contact {{ font-size: 9.5pt; color: #4b5563; margin-bottom: 10pt; }}
  .role {{ margin-bottom: 8pt; }}
  .role-head {{ display: flex; justify-content: space-between; align-items: baseline; }}
  .period {{ color: #6b7280; font-size: 9.5pt; }}
  .loc {{ color: #6b7280; font-size: 9.5pt; font-style: italic; }}
  ul {{ margin: 4pt 0 0 18pt; padding: 0; }}
  li {{ margin-bottom: 2pt; }}
  .summary {{ font-style: italic; color: #374151; }}
</style>
</head>
<body>
  <h1>{name}</h1>
  {f'<div class="contact">{contact_line}</div>' if contact_line else ''}
  {f'<section><p class="summary">{summary}</p></section>' if summary else ''}
  {f'<section><h2>Experience</h2>{exp_html}</section>' if exp_html else ''}
  {f'<section><h2>Skills</h2><p>{skills_html}</p></section>' if skills_html else ''}
  {projects_html}
</body>
</html>"""


def html_to_pdf_bytes(html_str: str) -> bytes | None:
    """Render HTML to PDF bytes via WeasyPrint. Returns None if WeasyPrint
    or its native deps aren't available — caller can save the HTML instead.
    """
    try:
        from weasyprint import HTML  # type: ignore[import-not-found]
    except (ImportError, OSError) as exc:
        # OSError covers libpango / libcairo not found
        log.warning("WeasyPrint unavailable (%s) — caller will fall back to HTML output", exc)
        return None

    try:
        return HTML(string=html_str).write_pdf()
    except Exception as exc:  # noqa: BLE001
        log.error("WeasyPrint render failed: %s", exc)
        return None
