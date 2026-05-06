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
