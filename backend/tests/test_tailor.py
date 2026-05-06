"""Phase 5 — tailor pipeline, tier gating, monthly reset, PDF rendering."""
from __future__ import annotations

import io
import os
from datetime import datetime, timedelta, timezone

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
- Built FastAPI services using PostgreSQL and Redis. Deployed on Kubernetes.

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
async def primed_client(auth_client):
    """Auth client with: ingested fixture jobs + uploaded master resume."""
    await auth_client.post("/internal/jobs/fetch", json={"queries": ["test"]})
    await auth_client.post(
        "/api/resume/upload",
        files={"file": ("alex.txt", io.BytesIO(SAMPLE_RESUME), "text/plain")},
    )
    return auth_client


async def _first_job_id(client) -> str:
    r = await client.get("/api/jobs?page_size=1")
    return r.json()["items"][0]["id"]


# ── Happy path ──────────────────────────────────────────────────────
async def test_tailor_full_pipeline(primed_client):
    job_id = await _first_job_id(primed_client)

    r = await primed_client.post("/api/resume/tailor", json={"job_id": job_id})
    assert r.status_code == 200, r.text
    body = r.json()

    assert body["id"].startswith("tr_")
    assert isinstance(body["ats_score"], int)
    assert 0 <= body["ats_score"] <= 100
    assert body["sonnet_method"] == "stub"
    assert body["pdf_extension"] in ("pdf", "html")
    assert body["pdf_url"].startswith(("file://", "http"))
    assert body["content_markdown"].startswith("# ")
    assert body["tailor_count_month"] == 1
    assert body["tailor_limit"] in (3, 100, 10**9)


async def test_tailor_persists_and_listable(primed_client):
    job_id = await _first_job_id(primed_client)
    r = await primed_client.post("/api/resume/tailor", json={"job_id": job_id})
    tid = r.json()["id"]

    r = await primed_client.get("/api/tailored-resumes")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 1
    assert rows[0]["id"] == tid
    assert rows[0]["job_id"] == job_id

    r = await primed_client.get(f"/api/tailored-resumes/{tid}")
    assert r.status_code == 200
    assert r.json()["id"] == tid


async def test_pdf_download_endpoint(primed_client):
    job_id = await _first_job_id(primed_client)
    r = await primed_client.post("/api/resume/tailor", json={"job_id": job_id})
    tid = r.json()["id"]

    r = await primed_client.get(f"/api/tailored-resumes/{tid}/pdf")
    assert r.status_code == 200
    assert len(r.content) > 100


async def test_tailor_filter_by_job(primed_client):
    r = await primed_client.get("/api/jobs?page_size=2")
    job_ids = [j["id"] for j in r.json()["items"]]

    for jid in job_ids:
        await primed_client.post("/api/resume/tailor", json={"job_id": jid})

    r = await primed_client.get(f"/api/tailored-resumes?job_id={job_ids[0]}")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 1
    assert rows[0]["job_id"] == job_ids[0]


# ── Error paths ─────────────────────────────────────────────────────
async def test_tailor_without_master_resume_404(auth_client):
    await auth_client.post("/internal/jobs/fetch", json={"queries": ["test"]})
    job_id = await _first_job_id(auth_client)

    r = await auth_client.post("/api/resume/tailor", json={"job_id": job_id})
    assert r.status_code == 404
    assert "master resume" in r.json()["detail"]


async def test_tailor_unknown_job_404(primed_client):
    r = await primed_client.post("/api/resume/tailor", json={"job_id": "does-not-exist"})
    assert r.status_code == 404


async def test_tailor_requires_auth(storage):
    from backend.main import app
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post("/api/resume/tailor", json={"job_id": "x"})
    assert r.status_code == 401


# ── Tier gate ───────────────────────────────────────────────────────
async def test_free_tier_blocks_after_3_tailors(primed_client, storage):
    await storage.upsert_user("local", "local@desktop", plan="free")
    job_id = await _first_job_id(primed_client)

    for i in range(3):
        r = await primed_client.post("/api/resume/tailor", json={"job_id": job_id})
        assert r.status_code == 200, f"tailor {i+1}: {r.text}"
        assert r.json()["tailor_count_month"] == i + 1

    r = await primed_client.post("/api/resume/tailor", json={"job_id": job_id})
    assert r.status_code == 402
    assert "limit" in r.json()["detail"].lower()


async def test_pro_tier_allows_more(primed_client, storage):
    await storage.upsert_user("local", "local@desktop", plan="pro")
    job_id = await _first_job_id(primed_client)

    for _ in range(5):
        r = await primed_client.post("/api/resume/tailor", json={"job_id": job_id})
        assert r.status_code == 200

    quota = (await primed_client.get("/api/me/tailor-quota")).json()
    assert quota["plan"] == "pro"
    assert quota["tailor_limit"] == 100
    assert quota["tailor_count_month"] == 5


async def test_quota_endpoint_initial_state(auth_client):
    r = await auth_client.get("/api/me/tailor-quota")
    body = r.json()
    assert body["tailor_count_month"] == 0
    assert body["tailor_limit"] in (3, 100, 10**9)


# ── Monthly reset ───────────────────────────────────────────────────
async def test_tailor_count_resets_after_window(storage):
    await storage.upsert_user("u-rst", "x@y", plan="free")

    await storage.increment_tailor_count("u-rst")
    await storage.increment_tailor_count("u-rst")
    user = await storage.get_user("u-rst")
    assert user["tailor_count_month"] == 2

    # Backdate the reset window
    past = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%S.%fZ")[:-4] + "Z"
    await storage._db.execute(
        "UPDATE users SET tailor_count_reset_at = ? WHERE id = ?", (past, "u-rst")
    )
    await storage._db.commit()

    new_count = await storage.reset_tailor_count_if_due("u-rst")
    assert new_count == 0

    user = await storage.get_user("u-rst")
    assert user["tailor_count_month"] == 0


# ── ATS scoring sanity ──────────────────────────────────────────────
async def test_ats_score_for_matching_vs_unrelated_role(primed_client):
    """A Python/FastAPI resume should not score lower on a Python job than on
    a Designer role. JustHireMe scoring_engine in action."""
    r = await primed_client.get("/api/jobs?page_size=20")
    jobs = r.json()["items"]

    matching = next((j for j in jobs if "Python" in (j.get("tech_stack") or [])), None)
    designer = next((j for j in jobs if j.get("field") == "Design"), None)

    if matching is None or designer is None:
        pytest.skip("fixture set didn't produce both a matching and a designer job")

    r1 = await primed_client.post("/api/resume/tailor", json={"job_id": matching["id"]})
    r2 = await primed_client.post("/api/resume/tailor", json={"job_id": designer["id"]})

    assert r1.json()["ats_score"] >= r2.json()["ats_score"]
