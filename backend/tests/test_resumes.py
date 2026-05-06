"""Phase 3 — resume upload + master resume CRUD."""
from __future__ import annotations

import io
import os

import pytest
from httpx import ASGITransport, AsyncClient

os.environ["STUB_ANTHROPIC"] = "1"
os.environ["STUB_JOBS_API"] = "1"

pytestmark = pytest.mark.asyncio


SAMPLE_RESUME_TEXT = """Alex Smith
alex@example.com  |  +1 555-123-4567  |  github.com/alexsmith  |  linkedin.com/in/alexsmith

SUMMARY
Senior backend engineer with 6 years of experience.

EXPERIENCE
Senior Engineer  |  Acme Corp  |  2022-Present
- Led migration to FastAPI and PostgreSQL.

EDUCATION
B.S. Computer Science, Stanford University, 2019

SKILLS
Python, FastAPI, PostgreSQL, AWS, Docker, Kubernetes, Redis, TypeScript
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


async def test_get_master_resume_returns_404_when_none(auth_client):
    r = await auth_client.get("/api/me/master-resume")
    assert r.status_code == 404


async def test_upload_text_resume_parses_and_persists(auth_client):
    files = {"file": ("alex.txt", io.BytesIO(SAMPLE_RESUME_TEXT.encode()), "text/plain")}
    r = await auth_client.post("/api/resume/upload", files=files)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["parse_method"] == "stub"  # STUB_ANTHROPIC=1
    assert body["contact_info"]["email"] == "alex@example.com"
    assert body["contact_info"]["github"].endswith("alexsmith")
    assert body["skills_count"] >= 4

    # Now fetch the master resume
    r = await auth_client.get("/api/me/master-resume")
    assert r.status_code == 200
    body = r.json()
    assert body["contact_info"]["email"] == "alex@example.com"
    assert "Python" in body["skills"]


async def test_put_master_resume_manual_builder(auth_client):
    payload = {
        "contact_info": {"name": "Jane Doe", "email": "jane@example.com"},
        "summary": "Product manager focused on growth",
        "experience": [
            {"role": "PM", "company": "Stripe", "period": "2022-2025", "description": "Drove ARR up 40%"}
        ],
        "education": [{"school": "MIT", "degree": "B.S. CS", "period": "2018-2022"}],
        "skills": ["SQL", "Analytics", "Product Management"],
        "projects": [],
        "certifications": ["PMP"],
    }
    r = await auth_client.put("/api/me/master-resume", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["contact_info"]["name"] == "Jane Doe"
    assert body["parse_method"] == "manual"
    assert body["certifications"] == ["PMP"]


async def test_upload_replaces_active_master_resume(auth_client):
    files1 = {"file": ("v1.txt", io.BytesIO(b"alex@a.com python"), "text/plain")}
    await auth_client.post("/api/resume/upload", files=files1)

    files2 = {"file": ("v2.txt", io.BytesIO(b"alex@b.com rust go"), "text/plain")}
    await auth_client.post("/api/resume/upload", files=files2)

    r = await auth_client.get("/api/me/master-resume")
    body = r.json()
    # Latest upload wins (history preserved in DB but get_active returns newest)
    assert body["contact_info"]["email"] == "alex@b.com"


async def test_oversize_resume_rejected(auth_client):
    big = b"x" * (6 * 1024 * 1024)  # 6 MB
    r = await auth_client.post(
        "/api/resume/upload",
        files={"file": ("big.txt", io.BytesIO(big), "text/plain")},
    )
    assert r.status_code == 413


async def test_resume_upload_requires_auth(storage):
    from backend.main import app
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(
                "/api/resume/upload",
                files={"file": ("x.txt", io.BytesIO(b"hi"), "text/plain")},
            )
    assert r.status_code == 401
