"""Phase 8 — Analytics service (pure aggregation, no I/O).

The endpoint layer fetches rows through StorageAdapter and hands them to these
functions. Keeping the math pure makes it adapter-agnostic (works for both
SqliteAdapter and the future Supabase implementation) and trivially unit-testable.

Status semantics (PRD §11 — 8-stage tracker):
    saved → applied → phone_screen → technical → onsite → offer → accepted
                  ↘ rejected (terminal, can be reached from any post-saved stage)

A "response" = the company moved past `applied` in any direction (forward into
the interview pipeline, or terminal `rejected`). Apps still in `saved` or
`applied` are not counted as responded.
"""
from __future__ import annotations

from datetime import datetime, timezone
from statistics import mean
from typing import Any, Iterable


# ── Status sets (used to classify each application's history) ─────────────
APPLIED_SET = frozenset({
    "applied", "phone_screen", "technical", "onsite",
    "offer", "accepted", "rejected",
})
RESPONSE_SET = frozenset({
    "phone_screen", "technical", "onsite", "offer", "accepted", "rejected",
})
INTERVIEW_SET = frozenset({
    "phone_screen", "technical", "onsite", "offer", "accepted",
})
OFFER_SET = frozenset({"offer", "accepted"})

ALL_STAGES = (
    "saved", "applied", "phone_screen", "technical",
    "onsite", "offer", "accepted", "rejected",
)


# ── Helpers ───────────────────────────────────────────────────────────────
def _statuses_seen(app: dict[str, Any]) -> set[str]:
    """Union of every status the application has ever held."""
    history = app.get("status_history") or []
    seen = {entry.get("status") for entry in history if entry.get("status")}
    if app.get("status"):
        seen.add(app["status"])
    return {s for s in seen if s}


def _first_changed_at(history: list[dict[str, Any]], target_set: Iterable[str]) -> str | None:
    """Earliest changed_at where status is in target_set. None if never reached."""
    targets = set(target_set)
    earliest: str | None = None
    for entry in history or []:
        if entry.get("status") in targets and entry.get("changed_at"):
            if earliest is None or entry["changed_at"] < earliest:
                earliest = entry["changed_at"]
    return earliest


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        # SQLite timestamps are 'YYYY-MM-DDTHH:MM:SS.fffZ'; strip the Z.
        cleaned = value.replace("Z", "+00:00")
        dt = datetime.fromisoformat(cleaned)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


# ── Aggregations ──────────────────────────────────────────────────────────
def summary_metrics(applications: list[dict[str, Any]]) -> dict[str, Any]:
    """Returns total/applied/response/interview/offer counts + rates +
    avg_days_to_response. Window-filtering is the caller's responsibility.
    """
    total = len(applications)
    applied = 0
    responded = 0
    interviewed = 0
    offered = 0
    response_lags_seconds: list[float] = []

    for app in applications:
        history = app.get("status_history") or []
        seen = _statuses_seen(app)

        if seen & APPLIED_SET:
            applied += 1
        if seen & RESPONSE_SET:
            responded += 1
        if seen & INTERVIEW_SET:
            interviewed += 1
        if seen & OFFER_SET:
            offered += 1

        # days-to-response: time from `applied` → first response status
        applied_at = _parse_iso(_first_changed_at(history, {"applied"}))
        if applied_at and (seen & RESPONSE_SET):
            response_at = _parse_iso(_first_changed_at(history, RESPONSE_SET))
            if response_at and response_at >= applied_at:
                response_lags_seconds.append((response_at - applied_at).total_seconds())

    def _rate(num: int, den: int) -> float:
        return round(num / den, 4) if den else 0.0

    avg_days = (
        round(mean(response_lags_seconds) / 86400.0, 2)
        if response_lags_seconds else None
    )

    return {
        "total_applications": total,
        "applied_count": applied,
        "responded_count": responded,
        "interviewed_count": interviewed,
        "offered_count": offered,
        "response_rate": _rate(responded, applied),
        "interview_rate": _rate(interviewed, applied),
        "offer_rate": _rate(offered, applied),
        "avg_days_to_response": avg_days,
        "response_sample_size": len(response_lags_seconds),
    }


def funnel_counts(applications: list[dict[str, Any]]) -> dict[str, Any]:
    """Cumulative funnel: how many apps EVER reached each stage. Mutually
    inclusive (an offered app counts at every prior stage)."""
    counts = {stage: 0 for stage in ALL_STAGES}
    for app in applications:
        seen = _statuses_seen(app)
        for stage in ALL_STAGES:
            if stage in seen:
                counts[stage] += 1

    return {
        "stages": [
            {"status": stage, "count": counts[stage]}
            for stage in ALL_STAGES
        ],
        "total_applications": len(applications),
    }


def ats_correlation(
    applications: list[dict[str, Any]],
    tailored_by_id: dict[str, dict[str, Any]],
    *,
    min_per_bucket: int = 3,
) -> dict[str, Any]:
    """Average ATS score for apps that got a response vs those that didn't.

    Bucketing rule: only apps that (a) reached `applied` and (b) have a
    linked tailored_resume with an ats_score qualify. Below `min_per_bucket`
    samples in either bucket → low_data=True so the UI can show a "not enough
    data yet" state instead of headline numbers based on n=1.
    """
    responded_scores: list[int] = []
    not_responded_scores: list[int] = []
    points: list[dict[str, Any]] = []  # for scatter rendering

    for app in applications:
        seen = _statuses_seen(app)
        if not (seen & APPLIED_SET):
            continue
        tid = app.get("tailored_resume_id")
        if not tid:
            continue
        tr = tailored_by_id.get(tid)
        if not tr:
            continue
        score = tr.get("ats_score")
        if score is None:
            continue

        was_responded = bool(seen & RESPONSE_SET)
        if was_responded:
            responded_scores.append(int(score))
        else:
            not_responded_scores.append(int(score))
        points.append({
            "application_id": app["id"],
            "ats_score": int(score),
            "responded": was_responded,
            "company": app.get("company"),
            "title": app.get("title"),
        })

    def _avg(values: list[int]) -> float | None:
        return round(mean(values), 1) if values else None

    low_data = (
        len(responded_scores) < min_per_bucket
        or len(not_responded_scores) < min_per_bucket
    )

    return {
        "responded": {
            "count": len(responded_scores),
            "avg_ats": _avg(responded_scores),
        },
        "not_responded": {
            "count": len(not_responded_scores),
            "avg_ats": _avg(not_responded_scores),
        },
        "delta": (
            None if low_data
            else round(_avg(responded_scores) - _avg(not_responded_scores), 1)
        ),
        "low_data": low_data,
        "min_per_bucket": min_per_bucket,
        "points": points,
    }


def digest_metrics(
    digest_logs: list[dict[str, Any]],
    *,
    tailor_count_total: int,
    tailor_count_from_digest: int,
) -> dict[str, Any]:
    """Open / click / conversion rates from email_digest_log over the window.

    `tailor_count_from_digest` is the count of tailored_resumes with
    source='digest' over the same window — that's our conversion proxy.
    """
    sent = len(digest_logs)
    opened = sum(1 for r in digest_logs if r.get("opened_at"))
    clicked = sum(1 for r in digest_logs if r.get("clicked_at"))

    def _rate(num: int, den: int) -> float:
        return round(num / den, 4) if den else 0.0

    return {
        "sent_count": sent,
        "opened_count": opened,
        "clicked_count": clicked,
        "tailor_conversions": tailor_count_from_digest,
        "tailor_count_total": tailor_count_total,
        "open_rate": _rate(opened, sent),
        "click_rate": _rate(clicked, sent),
        "click_through_rate": _rate(clicked, opened),
        "conversion_rate": _rate(tailor_count_from_digest, sent),
    }


def response_rate_by_field(
    applications: list[dict[str, Any]],
    job_field_lookup: dict[str, str],
) -> list[dict[str, Any]]:
    """Per-field response-rate breakdown for the bar chart on the analytics
    page. `job_field_lookup` maps job_id → field. Apps without a job_id (or
    with an unknown field) get bucketed under "Other"."""
    buckets: dict[str, dict[str, int]] = {}
    for app in applications:
        seen = _statuses_seen(app)
        if not (seen & APPLIED_SET):
            continue
        field = job_field_lookup.get(app.get("job_id") or "") or "Other"
        b = buckets.setdefault(field, {"applied": 0, "responded": 0})
        b["applied"] += 1
        if seen & RESPONSE_SET:
            b["responded"] += 1

    return [
        {
            "field": field,
            "applied": b["applied"],
            "responded": b["responded"],
            "response_rate": round(b["responded"] / b["applied"], 4) if b["applied"] else 0.0,
        }
        for field, b in sorted(buckets.items(), key=lambda kv: -kv[1]["applied"])
    ]
