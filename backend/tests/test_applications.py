"""Phase 3 — applications tracker, status_history, sub-resources, Free tier gate."""
from __future__ import annotations

import os

import pytest
from httpx import ASGITransport, AsyncClient

os.environ["STUB_ANTHROPIC"] = "1"
os.environ["STUB_JOBS_API"] = "1"

pytestmark = pytest.mark.asyncio


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


async def _set_plan(storage, user_id: str, plan: str):
    await storage.upsert_user(user_id, "local@desktop", plan=plan)


# ── Application CRUD ────────────────────────────────────────────────
async def test_create_list_get_delete_application(auth_client):
    r = await auth_client.post(
        "/api/applications",
        json={"title": "Senior Engineer", "company": "Stripe", "platform": "linkedin"},
    )
    assert r.status_code == 201, r.text
    app = r.json()
    aid = app["id"]
    assert app["status"] == "saved"
    assert len(app["status_history"]) == 1
    assert app["status_history"][0]["status"] == "saved"

    r = await auth_client.get("/api/applications")
    assert r.status_code == 200
    assert any(a["id"] == aid for a in r.json())

    r = await auth_client.get(f"/api/applications/{aid}")
    assert r.status_code == 200
    assert r.json()["company"] == "Stripe"

    r = await auth_client.delete(f"/api/applications/{aid}")
    assert r.status_code == 204
    r = await auth_client.get(f"/api/applications/{aid}")
    assert r.status_code == 404


async def test_status_change_appends_to_history(auth_client):
    r = await auth_client.post(
        "/api/applications",
        json={"title": "DevOps", "company": "Anthropic"},
    )
    aid = r.json()["id"]

    r = await auth_client.patch(
        f"/api/applications/{aid}",
        json={"status": "applied", "status_note": "applied via referral"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "applied"
    assert body["applied_at"] is not None  # auto-stamped
    assert len(body["status_history"]) == 2
    assert body["status_history"][-1]["note"] == "applied via referral"

    # Move through stages
    for s in ("phone_screen", "technical", "onsite", "offer", "accepted"):
        r = await auth_client.patch(f"/api/applications/{aid}", json={"status": s})
        assert r.status_code == 200
    final = r.json()
    assert final["status"] == "accepted"
    assert len(final["status_history"]) == 7  # saved + 6 transitions


async def test_invalid_status_rejected(auth_client):
    r = await auth_client.post(
        "/api/applications",
        json={"title": "X", "company": "Y", "status": "made-up"},
    )
    assert r.status_code == 400


async def test_unauthorized_access_returns_404(auth_client, storage):
    """One user can't read another user's application (defense in depth + RLS sim)."""
    r = await auth_client.post(
        "/api/applications",
        json={"title": "X", "company": "Y"},
    )
    aid = r.json()["id"]

    # Try to fetch with a different user_id directly via the storage layer.
    # In SaaS this would be RLS-enforced; in our SqliteAdapter we filter by user_id.
    other = await storage.get_application(aid, "different-user-id")
    assert other is None


# ── Free tier limit (10 active apps) ────────────────────────────────
async def test_free_tier_blocks_at_10_active(auth_client, storage):
    await _set_plan(storage, "local", "free")

    # Create 10 active applications — all succeed
    for i in range(10):
        r = await auth_client.post(
            "/api/applications",
            json={"title": f"Role {i}", "company": f"Co{i}"},
        )
        assert r.status_code == 201, f"failed at app {i}: {r.text}"

    # 11th must be rejected with 402
    r = await auth_client.post(
        "/api/applications",
        json={"title": "Role 11", "company": "Co11"},
    )
    assert r.status_code == 402
    assert "Free tier" in r.json()["detail"]

    # Mark one as rejected → frees up a slot
    apps = (await auth_client.get("/api/applications")).json()
    aid = apps[0]["id"]
    await auth_client.patch(f"/api/applications/{aid}", json={"status": "rejected"})

    # Now creating another active one should succeed
    r = await auth_client.post(
        "/api/applications",
        json={"title": "Role 12", "company": "Co12"},
    )
    assert r.status_code == 201


async def test_pro_tier_unlimited(auth_client, storage):
    await _set_plan(storage, "local", "pro")
    for i in range(15):
        r = await auth_client.post(
            "/api/applications",
            json={"title": f"Role {i}", "company": f"Co{i}"},
        )
        assert r.status_code == 201


async def test_filter_by_status(auth_client):
    for i, st in enumerate(("saved", "saved", "applied", "rejected")):
        await auth_client.post(
            "/api/applications",
            json={"title": f"R{i}", "company": "X", "status": st},
        )

    r = await auth_client.get("/api/applications?status=saved")
    assert len(r.json()) == 2

    r = await auth_client.get("/api/applications?status=rejected")
    assert len(r.json()) == 1


# ── Sub-resources ───────────────────────────────────────────────────
async def test_recruiter_contact_lifecycle(auth_client):
    r = await auth_client.post(
        "/api/applications",
        json={"title": "X", "company": "Stripe"},
    )
    aid = r.json()["id"]

    r = await auth_client.post(
        f"/api/applications/{aid}/contacts",
        json={"name": "Pat Recruiter", "role": "recruiter", "email": "pat@stripe.com"},
    )
    assert r.status_code == 201
    cid = r.json()["id"]
    assert r.json()["email"] == "pat@stripe.com"

    r = await auth_client.get(f"/api/applications/{aid}/contacts")
    assert len(r.json()) == 1
    assert r.json()[0]["id"] == cid


async def test_interview_lifecycle(auth_client):
    r = await auth_client.post("/api/applications", json={"title": "X", "company": "Y"})
    aid = r.json()["id"]

    r = await auth_client.post(
        f"/api/applications/{aid}/interviews",
        json={
            "round": "phone_screen",
            "scheduled_at": "2026-05-10T15:00:00Z",
            "duration_min": 30,
            "interviewer_names": ["Alex", "Sam"],
            "location": "remote",
        },
    )
    assert r.status_code == 201
    iv = r.json()
    assert iv["interviewer_names"] == ["Alex", "Sam"]
    assert iv["outcome"] == "pending"
    iid = iv["id"]

    r = await auth_client.patch(
        f"/api/applications/{aid}/interviews/{iid}",
        json={"outcome": "passed", "notes": "Strong signal"},
    )
    assert r.status_code == 200
    assert r.json()["outcome"] == "passed"

    r = await auth_client.get(f"/api/applications/{aid}/interviews")
    assert len(r.json()) == 1


async def test_salary_details_lifecycle(auth_client):
    r = await auth_client.post("/api/applications", json={"title": "X", "company": "Y"})
    aid = r.json()["id"]

    r = await auth_client.post(
        f"/api/applications/{aid}/salary",
        json={"base_min": 180000, "base_max": 220000, "bonus": 25000, "currency": "USD"},
    )
    assert r.status_code == 201
    assert r.json()["base_min"] == 180000

    r = await auth_client.get(f"/api/applications/{aid}/salary")
    assert len(r.json()) == 1


async def test_subresource_on_unknown_application_404(auth_client):
    r = await auth_client.post(
        "/api/applications/does-not-exist/contacts",
        json={"name": "X"},
    )
    assert r.status_code == 404


# ── Starring / patching multiple fields ─────────────────────────────
async def test_patch_starred_and_notes(auth_client):
    r = await auth_client.post("/api/applications", json={"title": "X", "company": "Y"})
    aid = r.json()["id"]

    r = await auth_client.patch(
        f"/api/applications/{aid}",
        json={"starred": True, "notes": "Top priority"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["starred"] is True
    assert body["notes"] == "Top priority"

    # status_history not appended when status didn't change
    assert len(body["status_history"]) == 1
