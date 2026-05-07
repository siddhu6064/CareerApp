"""Phase 8 — cover letters + interview prep, Pro+ gating."""
from __future__ import annotations

import io
import os

import pytest
from httpx import ASGITransport, AsyncClient

os.environ["STUB_ANTHROPIC"] = "1"
os.environ["STUB_JOBS_API"] = "1"

pytestmark = pytest.mark.asyncio


SAMPLE_RESUME = b"""Alex Chen
alex.chen@example.com  |  github.com/alexchen

SUMMARY
Backend engineer with 5 years of Python experience.

EXPERIENCE
Senior Engineer at Acme | 2022-Present
- Built FastAPI services on PostgreSQL and Redis. Deployed on Kubernetes.

SKILLS
Python, FastAPI, PostgreSQL, Redis, Docker, Kubernetes, AWS, TypeScript
"""


@pytest.fixture
async def auth_client(storage):
    from backend import config
    from backend.main import app

    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": f"Bearer {config.LOCAL_API_TOKEN}"},
        ) as ac:
            yield ac


@pytest.fixture
async def primed_client(auth_client, storage):
    """Pro plan + ingested fixtures + uploaded resume."""
    await storage.upsert_user("local", "local@desktop", plan="pro")
    await auth_client.post("/internal/jobs/fetch", json={"queries": ["test"]})
    await auth_client.post(
        "/api/resume/upload",
        files={"file": ("alex.txt", io.BytesIO(SAMPLE_RESUME), "text/plain")},
    )
    return auth_client


async def _first_job_id(client) -> str:
    r = await client.get("/api/jobs?page_size=1")
    return r.json()["items"][0]["id"]


# ── Cover letter happy path ─────────────────────────────────────────
async def test_create_cover_letter(primed_client):
    job_id = await _first_job_id(primed_client)
    r = await primed_client.post("/api/cover-letter", json={"job_id": job_id})
    assert r.status_code == 200, r.text

    body = r.json()
    assert body["id"].startswith("cl_")
    assert body["job_id"] == job_id
    assert body["sonnet_method"] == "stub"
    assert body["pdf_extension"] in ("pdf", "html")
    assert body["pdf_url"].startswith(("file://", "http"))
    assert body["tone"] == "professional"
    assert "Acme" in body["content_markdown"] or "Alex" in body["content_markdown"]


async def test_cover_letter_persisted_and_listable(primed_client):
    job_id = await _first_job_id(primed_client)
    r = await primed_client.post("/api/cover-letter", json={"job_id": job_id})
    cid = r.json()["id"]

    r = await primed_client.get("/api/cover-letters")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 1
    assert rows[0]["id"] == cid

    r = await primed_client.get(f"/api/cover-letters/{cid}")
    assert r.status_code == 200
    assert r.json()["id"] == cid


async def test_cover_letter_filter_by_job(primed_client):
    r = await primed_client.get("/api/jobs?page_size=2")
    job_ids = [j["id"] for j in r.json()["items"]]
    for jid in job_ids:
        await primed_client.post("/api/cover-letter", json={"job_id": jid})

    r = await primed_client.get(f"/api/cover-letters?job_id={job_ids[0]}")
    assert len(r.json()) == 1
    assert r.json()[0]["job_id"] == job_ids[0]


async def test_cover_letter_pdf_download(primed_client):
    job_id = await _first_job_id(primed_client)
    r = await primed_client.post("/api/cover-letter", json={"job_id": job_id})
    cid = r.json()["id"]

    r = await primed_client.get(f"/api/cover-letters/{cid}/pdf")
    assert r.status_code == 200
    assert len(r.content) > 100


async def test_cover_letter_with_tailored_resume_link(primed_client):
    job_id = await _first_job_id(primed_client)
    # First, tailor the resume
    r = await primed_client.post("/api/resume/tailor", json={"job_id": job_id})
    tid = r.json()["id"]

    # Now generate cover letter linked to that tailored resume
    r = await primed_client.post(
        "/api/cover-letter",
        json={"job_id": job_id, "tailored_resume_id": tid},
    )
    assert r.status_code == 200
    assert r.json()["tailored_resume_id"] == tid


async def test_cover_letter_tones(primed_client):
    job_id = await _first_job_id(primed_client)
    for tone in ("professional", "enthusiastic", "concise"):
        r = await primed_client.post(
            "/api/cover-letter",
            json={"job_id": job_id, "tone": tone},
        )
        assert r.status_code == 200, f"tone {tone}: {r.text}"
        assert r.json()["tone"] == tone


async def test_invalid_tone_400(primed_client):
    job_id = await _first_job_id(primed_client)
    r = await primed_client.post(
        "/api/cover-letter",
        json={"job_id": job_id, "tone": "snarky"},
    )
    assert r.status_code == 400


# ── Interview prep happy path ───────────────────────────────────────
async def test_create_interview_prep(primed_client):
    job_id = await _first_job_id(primed_client)
    r = await primed_client.post("/api/interview-prep", json={"job_id": job_id})
    assert r.status_code == 200, r.text

    body = r.json()
    assert body["id"].startswith("ip_")
    assert body["job_id"] == job_id
    assert body["haiku_method"] == "stub"

    # Stub should produce ≥ 6 questions across multiple types
    assert len(body["questions"]) >= 6
    types = {q["type"] for q in body["questions"]}
    assert "behavioral" in types
    assert "company" in types or "role" in types

    # Each question has the four expected keys
    for q in body["questions"]:
        assert q["question"]
        assert "why_asked" in q
        assert "suggested_approach" in q

    # Top-level lists populated
    assert isinstance(body["strengths"], list)
    assert isinstance(body["gaps_to_address"], list)
    assert isinstance(body["talking_points"], list)
    assert len(body["talking_points"]) >= 1


async def test_interview_prep_listable(primed_client):
    job_id = await _first_job_id(primed_client)
    await primed_client.post("/api/interview-prep", json={"job_id": job_id})
    await primed_client.post("/api/interview-prep", json={"job_id": job_id})

    r = await primed_client.get("/api/interview-prep")
    assert r.status_code == 200
    assert len(r.json()) == 2

    r = await primed_client.get(f"/api/interview-prep?job_id={job_id}")
    assert len(r.json()) == 2


async def test_interview_prep_get_by_id(primed_client):
    job_id = await _first_job_id(primed_client)
    r = await primed_client.post("/api/interview-prep", json={"job_id": job_id})
    pid = r.json()["id"]

    r = await primed_client.get(f"/api/interview-prep/{pid}")
    assert r.status_code == 200
    assert r.json()["id"] == pid


# ── Pro+ gate ───────────────────────────────────────────────────────
async def test_free_tier_blocked_from_cover_letter(primed_client, storage):
    await storage.upsert_user("local", "local@desktop", plan="free")
    job_id = await _first_job_id(primed_client)

    r = await primed_client.post("/api/cover-letter", json={"job_id": job_id})
    assert r.status_code == 402
    assert "Pro" in r.json()["detail"]


async def test_free_tier_blocked_from_interview_prep(primed_client, storage):
    await storage.upsert_user("local", "local@desktop", plan="free")
    job_id = await _first_job_id(primed_client)

    r = await primed_client.post("/api/interview-prep", json={"job_id": job_id})
    assert r.status_code == 402


async def test_coach_plan_allowed(primed_client, storage):
    await storage.upsert_user("local", "local@desktop", plan="coach")
    job_id = await _first_job_id(primed_client)

    r = await primed_client.post("/api/cover-letter", json={"job_id": job_id})
    assert r.status_code == 200

    r = await primed_client.post("/api/interview-prep", json={"job_id": job_id})
    assert r.status_code == 200


# ── Error paths ─────────────────────────────────────────────────────
async def test_cover_letter_without_master_resume_404(auth_client, storage):
    await storage.upsert_user("local", "local@desktop", plan="pro")
    await auth_client.post("/internal/jobs/fetch", json={"queries": ["test"]})
    job_id = await _first_job_id(auth_client)

    r = await auth_client.post("/api/cover-letter", json={"job_id": job_id})
    assert r.status_code == 404
    assert "master resume" in r.json()["detail"]


async def test_unknown_job_404(primed_client):
    r = await primed_client.post("/api/cover-letter", json={"job_id": "nope"})
    assert r.status_code == 404

    r = await primed_client.post("/api/interview-prep", json={"job_id": "nope"})
    assert r.status_code == 404


async def test_unauth_blocked(storage):
    from backend.main import app
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post("/api/cover-letter", json={"job_id": "x"})
    assert r.status_code == 401


# ══════════════════════════════════════════════════════════════════════
# Analytics dashboard (Pro+ only)
# ══════════════════════════════════════════════════════════════════════
async def _create_app(client, *, title="Backend Engineer", company="Acme",
                      job_id=None, status_chain=("saved",)):
    """Create an application then walk it through a status chain."""
    payload = {"title": title, "company": company, "status": status_chain[0]}
    if job_id:
        payload["job_id"] = job_id
    r = await client.post("/api/applications", json=payload)
    assert r.status_code == 201, r.text
    aid = r.json()["id"]
    for s in status_chain[1:]:
        r = await client.patch(f"/api/applications/{aid}", json={"status": s})
        assert r.status_code == 200, r.text
    return aid


async def test_summary_empty(primed_client):
    r = await primed_client.get("/api/analytics/summary")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total_applications"] == 0
    assert body["applied_count"] == 0
    assert body["response_rate"] == 0.0
    assert body["avg_days_to_response"] is None
    assert body["window"]["days"] == 90
    assert body["window"]["plan"] == "pro"


async def test_summary_counts_responses_and_offers(primed_client):
    # 4 apps:
    #   1 stuck at saved  → not applied
    #   1 applied, no response
    #   1 applied → phone_screen → onsite (interview, no offer)
    #   1 applied → phone_screen → onsite → offer → accepted
    await _create_app(primed_client, status_chain=("saved",))
    await _create_app(primed_client, status_chain=("saved", "applied"))
    await _create_app(
        primed_client,
        status_chain=("saved", "applied", "phone_screen", "onsite"),
    )
    await _create_app(
        primed_client,
        status_chain=("saved", "applied", "phone_screen", "onsite", "offer", "accepted"),
    )

    r = await primed_client.get("/api/analytics/summary")
    body = r.json()
    assert body["total_applications"] == 4
    assert body["applied_count"] == 3
    assert body["responded_count"] == 2
    assert body["interviewed_count"] == 2
    assert body["offered_count"] == 1
    # 2 of 3 applied responded
    assert abs(body["response_rate"] - 2 / 3) < 1e-3
    # 1 of 3 applied got an offer
    assert abs(body["offer_rate"] - 1 / 3) < 1e-3


async def test_funnel_cumulative_counts(primed_client):
    await _create_app(primed_client, status_chain=("saved", "applied", "phone_screen"))
    await _create_app(
        primed_client,
        status_chain=("saved", "applied", "phone_screen", "technical", "onsite", "offer"),
    )
    await _create_app(primed_client, status_chain=("saved", "applied", "rejected"))

    r = await primed_client.get("/api/analytics/funnel")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total_applications"] == 3

    by_status = {s["status"]: s["count"] for s in body["stages"]}
    assert by_status["saved"] == 3
    assert by_status["applied"] == 3
    assert by_status["phone_screen"] == 2
    assert by_status["technical"] == 1
    assert by_status["onsite"] == 1
    assert by_status["offer"] == 1
    assert by_status["accepted"] == 0
    assert by_status["rejected"] == 1


async def test_funnel_by_field_breakdown(primed_client):
    # Applications attached to real jobs so by_field can resolve field
    r = await primed_client.get("/api/jobs?page_size=4")
    jobs = r.json()["items"]
    assert len(jobs) >= 2

    for j in jobs[:2]:
        await _create_app(
            primed_client, job_id=j["id"], company=j["company"],
            status_chain=("saved", "applied", "phone_screen"),
        )
    for j in jobs[2:4]:
        await _create_app(
            primed_client, job_id=j["id"], company=j["company"],
            status_chain=("saved", "applied"),
        )

    r = await primed_client.get("/api/analytics/funnel")
    body = r.json()
    # by_field is populated and rates are sane (0..1)
    assert isinstance(body["by_field"], list)
    for row in body["by_field"]:
        assert 0.0 <= row["response_rate"] <= 1.0
        assert row["responded"] <= row["applied"]


async def test_ats_correlation_low_data_flag(primed_client):
    # Tailor + apply to 2 jobs only — under min_per_bucket (3) so low_data=True
    r = await primed_client.get("/api/jobs?page_size=2")
    jobs = r.json()["items"]
    for j in jobs:
        tr = await primed_client.post("/api/resume/tailor", json={"job_id": j["id"]})
        tid = tr.json()["id"]
        r = await primed_client.post("/api/applications", json={
            "title": j["title"], "company": j["company"],
            "job_id": j["id"], "status": "saved",
        })
        aid = r.json()["id"]
        # Link tailored + advance to applied
        await primed_client.patch(
            f"/api/applications/{aid}",
            json={"tailored_resume_id": tid, "status": "applied"},
        )

    r = await primed_client.get("/api/analytics/ats-correlation")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["low_data"] is True
    assert body["delta"] is None
    # Points still emitted so UI can render the scatter
    assert len(body["points"]) == 2


async def test_ats_correlation_full_data(primed_client):
    # Build 8 apps: 4 with responses + tailored, 4 without responses + tailored
    r = await primed_client.get("/api/jobs?page_size=8")
    jobs = r.json()["items"]
    assert len(jobs) >= 8

    for i, j in enumerate(jobs[:8]):
        tr = await primed_client.post("/api/resume/tailor", json={"job_id": j["id"]})
        tid = tr.json()["id"]
        r = await primed_client.post("/api/applications", json={
            "title": j["title"], "company": j["company"],
            "job_id": j["id"], "status": "saved",
        })
        aid = r.json()["id"]
        await primed_client.patch(
            f"/api/applications/{aid}",
            json={"tailored_resume_id": tid, "status": "applied"},
        )
        if i < 4:
            await primed_client.patch(
                f"/api/applications/{aid}", json={"status": "phone_screen"},
            )

    r = await primed_client.get("/api/analytics/ats-correlation")
    body = r.json()
    assert body["low_data"] is False
    assert body["responded"]["count"] == 4
    assert body["not_responded"]["count"] == 4
    assert body["delta"] is not None
    assert body["responded"]["avg_ats"] is not None


async def test_digest_metrics_empty(primed_client):
    r = await primed_client.get("/api/analytics/digest")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["sent_count"] == 0
    assert body["open_rate"] == 0.0
    assert body["tailor_conversions"] == 0


async def test_digest_metrics_with_logs(primed_client, storage):
    # Seed digest log directly
    await storage.log_email_digest(
        "local", subject="Today's jobs", job_ids=["j1", "j2"], resend_id="r1",
    )
    # Manually mark one row opened+clicked to test rates
    from backend.storage import get_storage
    s = get_storage()
    assert s._db is not None  # type: ignore[attr-defined]
    await s._db.execute(  # type: ignore[attr-defined]
        "UPDATE email_digest_log SET opened_at = '2025-01-01T00:00:00.000Z', "
        "clicked_at = '2025-01-01T00:01:00.000Z' WHERE user_id = 'local'"
    )
    await s._db.commit()  # type: ignore[attr-defined]

    r = await primed_client.get("/api/analytics/digest")
    body = r.json()
    assert body["sent_count"] == 1
    assert body["opened_count"] == 1
    assert body["clicked_count"] == 1
    assert body["open_rate"] == 1.0
    assert body["click_rate"] == 1.0


async def test_digest_source_flag_increments_conversions(primed_client):
    r = await primed_client.get("/api/jobs?page_size=2")
    jobs = r.json()["items"]
    # One tailor from app, one from digest
    await primed_client.post("/api/resume/tailor", json={"job_id": jobs[0]["id"]})
    await primed_client.post(
        "/api/resume/tailor",
        json={"job_id": jobs[1]["id"], "source": "digest"},
    )

    r = await primed_client.get("/api/analytics/digest")
    body = r.json()
    assert body["tailor_count_total"] == 2
    assert body["tailor_conversions"] == 1


async def test_window_days_param_filters(primed_client):
    await _create_app(primed_client, status_chain=("saved", "applied"))
    # Default 90-day window picks it up
    r = await primed_client.get("/api/analytics/summary")
    assert r.json()["applied_count"] == 1
    # 1-day window also picks up — app created seconds ago
    r = await primed_client.get("/api/analytics/summary?days=1")
    assert r.json()["applied_count"] == 1
    # Out-of-range rejected
    r = await primed_client.get("/api/analytics/summary?days=0")
    assert r.status_code == 422
    r = await primed_client.get("/api/analytics/summary?days=400")
    assert r.status_code == 422


# ── Pro+ gate (the data point that justifies the upgrade) ────────────
async def test_free_tier_blocked_from_all_analytics(primed_client, storage):
    await storage.upsert_user("local", "local@desktop", plan="free")
    for path in (
        "/api/analytics/summary",
        "/api/analytics/funnel",
        "/api/analytics/ats-correlation",
        "/api/analytics/digest",
    ):
        r = await primed_client.get(path)
        assert r.status_code == 402, f"{path} → {r.status_code}: {r.text}"
        assert "Pro" in r.json()["detail"]


async def test_coach_plan_allowed_on_analytics(primed_client, storage):
    await storage.upsert_user("local", "local@desktop", plan="coach")
    for path in (
        "/api/analytics/summary",
        "/api/analytics/funnel",
        "/api/analytics/ats-correlation",
        "/api/analytics/digest",
    ):
        r = await primed_client.get(path)
        assert r.status_code == 200, f"{path} → {r.status_code}"


async def test_desktop_plan_allowed_on_analytics(primed_client, storage):
    await storage.upsert_user("local", "local@desktop", plan="desktop")
    r = await primed_client.get("/api/analytics/summary")
    assert r.status_code == 200


async def test_analytics_unauth_blocked(storage):
    from backend.main import app
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.get("/api/analytics/summary")
    assert r.status_code == 401
