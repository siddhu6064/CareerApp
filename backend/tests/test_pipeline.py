"""Phase 2 — full pipeline + jobs endpoints. STUB_JOBS_API + STUB_ANTHROPIC ON.

Exercises:
  - JustHireMe quality_gate filtering the unpaid-internship spam fixture
  - Heuristic tagger producing valid field/level/tech_stack
  - Dedup via job_hash
  - List/detail/fields endpoints
  - /internal/jobs/fetch as the cron entry point
"""
from __future__ import annotations

import os

import pytest
from httpx import ASGITransport, AsyncClient

# Force stubs ON for the whole module — runs before any backend.* import
os.environ["STUB_JOBS_API"] = "1"
os.environ["STUB_ANTHROPIC"] = "1"

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def client(storage):
    from backend.main import app
    from backend.jobs.cache import job_feed_cache

    job_feed_cache.clear()
    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as ac:
            yield ac


# ── Pipeline directly ────────────────────────────────────────────────
async def test_pipeline_filters_spam_and_inserts_real_jobs(storage):
    from backend.jobs.pipeline import run_ingestion

    counters = await run_ingestion(storage, queries=["test"])

    # 12 fixtures total, 1 is unpaid spam → should be skipped by quality_gate
    assert counters["fetched"] == 12
    assert counters["skipped"] >= 1, f"expected spam to be filtered, got {counters}"
    assert counters["inserted"] == counters["gated"]
    assert counters["inserted"] == counters["tagged"]
    assert counters["inserted"] >= 8


async def test_pipeline_dedup_idempotent(storage):
    from backend.jobs.pipeline import run_ingestion

    first = await run_ingestion(storage, queries=["test"])
    second = await run_ingestion(storage, queries=["test"])

    # Same fixtures fetched twice — total active jobs unchanged after second run
    listing = await storage.list_jobs(page_size=100)
    assert listing["total"] == first["inserted"]
    assert listing["total"] == second["inserted"]


async def test_pipeline_tags_field_correctly(storage):
    from backend.jobs.pipeline import run_ingestion

    await run_ingestion(storage, queries=["test"])
    listing = await storage.list_jobs(page_size=100)

    # The TAM fixture should be tagged as Technical Account Manager
    tam = next((j for j in listing["items"] if "Technical Account" in j["title"]), None)
    assert tam is not None
    assert tam["field"] == "Technical Account Manager"

    # The OpenAI ML role should be Engineering or Data
    ml = next((j for j in listing["items"] if j["company"] == "OpenAI"), None)
    assert ml is not None
    assert ml["field"] in ("Engineering", "Data")


# ── Endpoints ────────────────────────────────────────────────────────
async def test_list_jobs_empty_initially(client):
    r = await client.get("/api/jobs")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 0
    assert body["items"] == []


async def test_internal_fetch_then_list(client):
    r = await client.post(
        "/internal/jobs/fetch",
        json={"queries": ["test"], "quality_threshold": 20},
    )
    assert r.status_code == 200
    counters = r.json()
    assert counters["inserted"] >= 8

    r = await client.get("/api/jobs?page_size=50")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == counters["inserted"]
    assert len(body["items"]) == body["total"]
    # Jobs should sort by quality_score DESC by default
    scores = [j["quality_score"] for j in body["items"] if j["quality_score"] is not None]
    assert scores == sorted(scores, reverse=True)


async def test_filter_by_field(client):
    await client.post("/internal/jobs/fetch", json={"queries": ["test"]})
    r = await client.get("/api/jobs?field=Engineering&page_size=50")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 1
    assert all(j["field"] == "Engineering" for j in body["items"])


async def test_filter_by_remote(client):
    await client.post("/internal/jobs/fetch", json={"queries": ["test"]})
    r = await client.get("/api/jobs?remote_type=remote&page_size=50")
    body = r.json()
    assert all(j["remote_type"] == "remote" for j in body["items"])
    # Multiple remote fixtures (Stripe, Anthropic, Vercel, Cal.com, Loom)
    assert body["total"] >= 4


async def test_filter_by_salary_min(client):
    await client.post("/internal/jobs/fetch", json={"queries": ["test"]})
    r = await client.get("/api/jobs?salary_min=200000&page_size=50")
    body = r.json()
    # Only the high-paying roles (Stripe Senior DevOps, Anthropic Data, OpenAI ML, Loom?, Notion)
    assert body["total"] >= 2
    for j in body["items"]:
        # salary_max >= 200000 (we filter on max so the role's range covers our floor)
        assert j["salary_max"] is None or j["salary_max"] >= 200000


async def test_field_counts(client):
    await client.post("/internal/jobs/fetch", json={"queries": ["test"]})
    r = await client.get("/api/jobs/fields")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 8
    assert "Engineering" in body["counts"]
    assert body["counts"]["Engineering"] >= 1


async def test_get_job_detail(client):
    await client.post("/internal/jobs/fetch", json={"queries": ["test"]})
    r = await client.get("/api/jobs?page_size=1")
    job_id = r.json()["items"][0]["id"]

    r = await client.get(f"/api/jobs/{job_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == job_id
    assert body["jd_raw"]  # detail includes raw JD


async def test_get_unknown_job_returns_404(client):
    r = await client.get("/api/jobs/does-not-exist")
    assert r.status_code == 404


async def test_pagination(client):
    await client.post("/internal/jobs/fetch", json={"queries": ["test"]})
    r1 = await client.get("/api/jobs?page=1&page_size=3")
    r2 = await client.get("/api/jobs?page=2&page_size=3")
    ids1 = [j["id"] for j in r1.json()["items"]]
    ids2 = [j["id"] for j in r2.json()["items"]]
    assert len(ids1) == 3
    assert not set(ids1) & set(ids2), "page 1 and page 2 share items"


async def test_cache_invalidates_after_fetch(client):
    # First call populates cache (empty result)
    r = await client.get("/api/jobs")
    assert r.json()["total"] == 0

    # Run ingestion → cache should be cleared
    await client.post("/internal/jobs/fetch", json={"queries": ["test"]})

    # Subsequent call should see fresh data, not stale empty cache
    r = await client.get("/api/jobs")
    assert r.json()["total"] >= 8
