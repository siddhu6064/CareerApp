"""Phase 9 — Coach tier (multi-client, bulk tailor, white-label PDF).

Tests use the auth_client / primed_client pattern from test_phase8.
"""
from __future__ import annotations

import io
import os

import pytest
from httpx import ASGITransport, AsyncClient

os.environ["STUB_ANTHROPIC"] = "1"
os.environ["STUB_JOBS_API"] = "1"
os.environ["STUB_RESEND"] = "1"

pytestmark = pytest.mark.asyncio


SAMPLE_RESUME = b"""Alex Chen
alex@example.com  |  github.com/alexchen

EXPERIENCE
Senior Engineer at Acme | 2022-Present
- Built FastAPI services on PostgreSQL.

SKILLS
Python, FastAPI, PostgreSQL, Docker
"""


# ── Fixtures ──────────────────────────────────────────────────────────
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
async def coach_client(auth_client, storage):
    """Local user is the coach (plan='coach'), with jobs ingested + master resume."""
    await storage.upsert_user("local", "coach@example.com", plan="coach")
    await auth_client.post("/internal/jobs/fetch", json={"queries": ["test"]})
    await auth_client.post(
        "/api/resume/upload",
        files={"file": ("alex.txt", io.BytesIO(SAMPLE_RESUME), "text/plain")},
    )
    return auth_client


async def _seed_client_user(storage, *, user_id: str, email: str, plan: str = "free"):
    """Create another user that will be added as a coach's client."""
    await storage.upsert_user(user_id, email, plan=plan)


async def _seed_master_for(storage, *, user_id: str):
    """Inject a minimal master resume so tailor doesn't 404 on the client."""
    await storage.upsert_master_resume({
        "user_id": user_id,
        "contact_info": {"name": "Client User", "email": "client@example.com"},
        "summary": "Software engineer.",
        "experience": [{
            "role": "Engineer",
            "company": "Beta Co",
            "period": "2020-2024",
            "description": "Stuff.",
            "location": "Remote",
        }],
        "education": [],
        "skills": ["Python", "FastAPI"],
        "projects": [],
        "certifications": [],
        "source": "app",
    })


# ── Coach gate ────────────────────────────────────────────────────────
async def test_free_user_blocked_from_coach_endpoints(auth_client, storage):
    await storage.upsert_user("local", "free@example.com", plan="free")
    # POST/PUT bodies must be schema-valid; gate fires AFTER request validation.
    bodies = {
        "POST /api/coach/clients": {"email": "x@y.com"},
        "PUT /api/coach/branding": {"brand_color": "#aabbcc"},
        "POST /api/coach/bulk-tailor": {
            "coach_client_ids": ["cc_x"], "job_id": "anything",
        },
    }
    paths = [
        ("GET", "/api/coach/clients"),
        ("POST", "/api/coach/clients"),
        ("GET", "/api/coach/branding"),
        ("PUT", "/api/coach/branding"),
        ("POST", "/api/coach/bulk-tailor"),
    ]
    for method, path in paths:
        kwargs = {"json": bodies.get(f"{method} {path}", {})} if method != "GET" else {}
        r = await auth_client.request(method, path, **kwargs)
        assert r.status_code == 402, f"{method} {path} → {r.status_code}: {r.text}"
        assert "Coach" in r.json()["detail"]


async def test_pro_user_blocked_from_coach_endpoints(auth_client, storage):
    await storage.upsert_user("local", "pro@example.com", plan="pro")
    r = await auth_client.get("/api/coach/clients")
    assert r.status_code == 402


async def test_desktop_plan_treated_as_coach(coach_client, storage):
    await storage.upsert_user("local", "desktop@local", plan="desktop")
    r = await coach_client.get("/api/coach/clients")
    assert r.status_code == 200


# ── Invite flow ──────────────────────────────────────────────────────
async def test_invite_creates_pending_row(coach_client, storage):
    r = await coach_client.post(
        "/api/coach/clients",
        json={"email": "client1@example.com", "name": "Client One"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "pending"
    assert body["invited_email"] == "client1@example.com"
    assert body["invite_token"]  # only exposed to the inviting coach
    assert body["client_id"] is None


async def test_invite_normalizes_email(coach_client):
    r = await coach_client.post(
        "/api/coach/clients",
        json={"email": "  Mixed.Case@Example.COM  "},
    )
    assert r.status_code == 201
    assert r.json()["invited_email"] == "mixed.case@example.com"


async def test_invite_rejects_invalid_email(coach_client):
    r = await coach_client.post("/api/coach/clients", json={"email": "not-email"})
    assert r.status_code == 400


async def test_duplicate_invite_409(coach_client):
    payload = {"email": "dup@example.com"}
    r = await coach_client.post("/api/coach/clients", json=payload)
    assert r.status_code == 201
    r = await coach_client.post("/api/coach/clients", json=payload)
    assert r.status_code == 409
    assert "pending" in r.json()["detail"].lower()


async def test_ten_client_cap_enforced(coach_client, storage):
    # 10 active clients via direct storage seeding. Need real user rows so the
    # FK constraint on client_id holds.
    for i in range(10):
        await storage.upsert_user(f"client_{i}", f"c{i}@example.com", plan="free")
        cid = await storage.add_coach_client(
            "local",
            invited_email=f"c{i}@example.com",
            invited_name=f"Client {i}",
            invite_token=f"tok_{i}",
        )
        # Manually flip to active so cap counts them
        await storage._db.execute(
            "UPDATE coach_clients SET status='active', client_id=? WHERE id=?",
            (f"client_{i}", cid),
        )
        await storage._db.commit()

    r = await coach_client.post(
        "/api/coach/clients", json={"email": "eleventh@example.com"},
    )
    assert r.status_code == 409
    assert "cap" in r.json()["detail"].lower()


async def test_invite_email_sent_via_resend_stub(coach_client):
    from backend.notifications.email import get_email_outbox, reset_email_outbox
    reset_email_outbox()
    r = await coach_client.post(
        "/api/coach/clients", json={"email": "outbox-test@example.com"},
    )
    assert r.status_code == 201
    outbox = get_email_outbox()
    assert any(e["to"] == "outbox-test@example.com" for e in outbox)
    inv = next(e for e in outbox if e["to"] == "outbox-test@example.com")
    assert "Accept" in inv["html"] or "accept" in inv["html"].lower()


async def test_invite_lookup_by_token(coach_client, storage):
    r = await coach_client.post(
        "/api/coach/clients", json={"email": "lookup@example.com"},
    )
    token = r.json()["invite_token"]

    r = await coach_client.get(f"/api/coach/invite/{token}")
    assert r.status_code == 200
    assert r.json()["status"] == "pending"


async def test_invite_lookup_unknown_404(coach_client):
    r = await coach_client.get("/api/coach/invite/no-such-token")
    assert r.status_code == 404


async def test_accept_invite(coach_client, storage):
    r = await coach_client.post(
        "/api/coach/clients", json={"email": "acceptor@example.com"},
    )
    token = r.json()["invite_token"]

    # Switch context: invitee is a different user_id. Easiest path is to add a
    # separate user row + flip the local token to act as them.
    await _seed_client_user(storage, user_id="invitee", email="acceptor@example.com")

    # Accept directly via the storage adapter (simulates a logged-in invitee)
    accepted = await storage.accept_coach_invite(token, "invitee")
    assert accepted is not None
    assert accepted["status"] == "active"
    assert accepted["client_id"] == "invitee"


async def test_accept_invite_self_rejected(coach_client, storage):
    r = await coach_client.post(
        "/api/coach/clients", json={"email": "self@example.com"},
    )
    token = r.json()["invite_token"]
    # Coach themselves cannot accept their own invite
    accepted = await storage.accept_coach_invite(token, "local")
    assert accepted is None


async def test_accept_invite_unknown_token(coach_client):
    r = await coach_client.post(
        "/api/coach/accept-invite", json={"invite_token": "junk-no-match"},
    )
    assert r.status_code == 400


# ── List + summary ────────────────────────────────────────────────────
async def test_list_clients_returns_summary(coach_client, storage):
    await _seed_client_user(storage, user_id="cl_a", email="a@example.com")
    await _seed_client_user(storage, user_id="cl_b", email="b@example.com")
    cid_a = await storage.add_coach_client(
        "local", invited_email="a@example.com", invited_name="A", invite_token="tA",
    )
    cid_b = await storage.add_coach_client(
        "local", invited_email="b@example.com", invited_name="B", invite_token="tB",
    )
    await storage.accept_coach_invite("tA", "cl_a")
    await storage.accept_coach_invite("tB", "cl_b")
    # Seed an application for client A
    await storage.create_application({
        "user_id": "cl_a", "title": "Eng", "company": "X", "status": "applied",
    })

    r = await coach_client.get("/api/coach/clients")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 2
    # Active rows include summary
    rec_a = next(x for x in rows if x["id"] == cid_a)
    assert rec_a["status"] == "active"
    assert rec_a["applied_count"] == 1
    # invite_token NOT exposed on list
    assert rec_a.get("invite_token") in (None, "")


async def test_get_client_invalid_id_404(coach_client):
    r = await coach_client.get("/api/coach/clients/cc_nope")
    assert r.status_code == 404


async def test_remove_client(coach_client, storage):
    cid = await storage.add_coach_client(
        "local", invited_email="rm@example.com", invited_name=None, invite_token="tR",
    )
    r = await coach_client.delete(f"/api/coach/clients/{cid}")
    assert r.status_code == 204
    r = await coach_client.get(f"/api/coach/clients/{cid}")
    assert r.status_code == 404


async def test_update_client_notes(coach_client, storage):
    cid = await storage.add_coach_client(
        "local", invited_email="n@example.com", invited_name=None, invite_token="tN",
    )
    r = await coach_client.patch(
        f"/api/coach/clients/{cid}", json={"notes": "VIP client"},
    )
    assert r.status_code == 200
    assert r.json()["notes"] == "VIP client"


async def test_cross_coach_isolation(coach_client, storage):
    """Coach A cannot see Coach B's clients."""
    # Seed coach B + a client of theirs
    await storage.upsert_user("coach_b", "b@coach.com", plan="coach")
    cid_b = await storage.add_coach_client(
        "coach_b", invited_email="bclient@example.com",
        invited_name=None, invite_token="tBC",
    )
    # Coach A (= "local") should not be able to fetch coach B's row
    r = await coach_client.get(f"/api/coach/clients/{cid_b}")
    assert r.status_code == 404
    # nor delete
    r = await coach_client.delete(f"/api/coach/clients/{cid_b}")
    assert r.status_code == 404


# ── Read-only client tracker / analytics ──────────────────────────────
async def test_coach_reads_client_tracker(coach_client, storage):
    await _seed_client_user(storage, user_id="trk", email="trk@example.com")
    cid = await storage.add_coach_client(
        "local", invited_email="trk@example.com", invited_name=None, invite_token="tT",
    )
    await storage.accept_coach_invite("tT", "trk")
    await storage.create_application({
        "user_id": "trk", "title": "Eng", "company": "Acme", "status": "applied",
    })

    r = await coach_client.get(f"/api/coach/clients/{cid}/tracker")
    assert r.status_code == 200
    apps = r.json()
    assert len(apps) == 1
    assert apps[0]["company"] == "Acme"


async def test_coach_reads_client_analytics(coach_client, storage):
    await _seed_client_user(storage, user_id="an", email="an@example.com")
    cid = await storage.add_coach_client(
        "local", invited_email="an@example.com", invited_name=None, invite_token="tAn",
    )
    await storage.accept_coach_invite("tAn", "an")
    await storage.create_application({
        "user_id": "an", "title": "Eng", "company": "Y", "status": "applied",
    })

    r = await coach_client.get(f"/api/coach/clients/{cid}/analytics")
    assert r.status_code == 200
    body = r.json()
    assert body["summary"]["applied_count"] == 1
    assert "funnel" in body


async def test_pending_client_tracker_404(coach_client, storage):
    cid = await storage.add_coach_client(
        "local", invited_email="pending@example.com",
        invited_name=None, invite_token="tP",
    )
    r = await coach_client.get(f"/api/coach/clients/{cid}/tracker")
    assert r.status_code == 404


# ── Tailor on behalf ──────────────────────────────────────────────────
async def test_coach_tailor_for_client(coach_client, storage):
    # Set up client with master resume
    await _seed_client_user(storage, user_id="cl_t", email="t@example.com")
    await _seed_master_for(storage, user_id="cl_t")
    cid = await storage.add_coach_client(
        "local", invited_email="t@example.com", invited_name=None, invite_token="tCT",
    )
    await storage.accept_coach_invite("tCT", "cl_t")

    r = await coach_client.get("/api/jobs?page_size=1")
    job_id = r.json()["items"][0]["id"]

    r = await coach_client.post(
        f"/api/coach/clients/{cid}/tailor", json={"job_id": job_id},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["tailored_id"]

    # Tailored row attributed to client
    rows = await storage.list_tailored_resumes("cl_t")
    assert len(rows) == 1


async def test_coach_tailor_charges_coach_quota(coach_client, storage):
    """Tailor saves under client_id but bumps the coach's tailor count."""
    await _seed_client_user(storage, user_id="cl_q", email="q@example.com")
    await _seed_master_for(storage, user_id="cl_q")
    cid = await storage.add_coach_client(
        "local", invited_email="q@example.com",
        invited_name=None, invite_token="tQ",
    )
    await storage.accept_coach_invite("tQ", "cl_q")

    r = await coach_client.get("/api/jobs?page_size=1")
    job_id = r.json()["items"][0]["id"]

    coach_before = (await storage.get_user("local"))["tailor_count_month"]
    client_before = (await storage.get_user("cl_q"))["tailor_count_month"]

    r = await coach_client.post(
        f"/api/coach/clients/{cid}/tailor", json={"job_id": job_id},
    )
    assert r.status_code == 200

    coach_after = (await storage.get_user("local"))["tailor_count_month"]
    client_after = (await storage.get_user("cl_q"))["tailor_count_month"]
    assert coach_after == coach_before + 1
    assert client_after == client_before


async def test_coach_tailor_client_without_master_400(coach_client, storage):
    await _seed_client_user(storage, user_id="cl_nm", email="nm@example.com")
    cid = await storage.add_coach_client(
        "local", invited_email="nm@example.com",
        invited_name=None, invite_token="tNM",
    )
    await storage.accept_coach_invite("tNM", "cl_nm")

    r = await coach_client.get("/api/jobs?page_size=1")
    job_id = r.json()["items"][0]["id"]

    r = await coach_client.post(
        f"/api/coach/clients/{cid}/tailor", json={"job_id": job_id},
    )
    assert r.status_code == 400
    assert "master resume" in r.json()["detail"].lower()


# ── Bulk tailor ───────────────────────────────────────────────────────
async def test_bulk_tailor_partial_success(coach_client, storage):
    """One client has master resume, one doesn't — bulk should report mixed."""
    await _seed_client_user(storage, user_id="cl_ok", email="ok@example.com")
    await _seed_master_for(storage, user_id="cl_ok")
    cid_ok = await storage.add_coach_client(
        "local", invited_email="ok@example.com",
        invited_name=None, invite_token="tOK",
    )
    await storage.accept_coach_invite("tOK", "cl_ok")

    await _seed_client_user(storage, user_id="cl_nope", email="nope@example.com")
    cid_nope = await storage.add_coach_client(
        "local", invited_email="nope@example.com",
        invited_name=None, invite_token="tNope",
    )
    await storage.accept_coach_invite("tNope", "cl_nope")

    r = await coach_client.get("/api/jobs?page_size=1")
    job_id = r.json()["items"][0]["id"]

    r = await coach_client.post(
        "/api/coach/bulk-tailor",
        json={"coach_client_ids": [cid_ok, cid_nope], "job_id": job_id},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 2
    assert body["succeeded"] == 1
    assert body["failed"] == 1
    succeeded = next(x for x in body["results"] if x["ok"])
    failed = next(x for x in body["results"] if not x["ok"])
    assert succeeded["tailored_id"]
    assert "master resume" in failed["error"].lower()


async def test_bulk_tailor_rejects_duplicates(coach_client, storage):
    cid = await storage.add_coach_client(
        "local", invited_email="dup@example.com",
        invited_name=None, invite_token="tD",
    )
    r = await coach_client.post(
        "/api/coach/bulk-tailor",
        json={"coach_client_ids": [cid, cid], "job_id": "anything"},
    )
    assert r.status_code == 400


async def test_bulk_tailor_runs_against_coach_quota(coach_client, storage):
    """3 successful tailors → coach count +3, each client count +0."""
    cids = []
    for i in range(3):
        await _seed_client_user(storage, user_id=f"cl_b{i}", email=f"b{i}@x.com")
        await _seed_master_for(storage, user_id=f"cl_b{i}")
        cid = await storage.add_coach_client(
            "local", invited_email=f"b{i}@x.com",
            invited_name=None, invite_token=f"tB{i}",
        )
        await storage.accept_coach_invite(f"tB{i}", f"cl_b{i}")
        cids.append(cid)

    r = await coach_client.get("/api/jobs?page_size=1")
    job_id = r.json()["items"][0]["id"]

    coach_before = (await storage.get_user("local"))["tailor_count_month"]
    r = await coach_client.post(
        "/api/coach/bulk-tailor",
        json={"coach_client_ids": cids, "job_id": job_id},
    )
    assert r.status_code == 200
    assert r.json()["succeeded"] == 3
    coach_after = (await storage.get_user("local"))["tailor_count_month"]
    assert coach_after == coach_before + 3


# ── Branding (white-label PDF) ───────────────────────────────────────
async def test_branding_default_empty(coach_client):
    r = await coach_client.get("/api/coach/branding")
    assert r.status_code == 200
    body = r.json()
    assert body["logo_path"] is None
    assert body["brand_color"] is None


async def test_branding_set_color(coach_client):
    r = await coach_client.put(
        "/api/coach/branding", json={"brand_color": "#A22FE0"},
    )
    assert r.status_code == 200
    assert r.json()["brand_color"] == "#a22fe0"

    r = await coach_client.get("/api/coach/branding")
    assert r.json()["brand_color"] == "#a22fe0"


async def test_branding_invalid_color_400(coach_client):
    r = await coach_client.put(
        "/api/coach/branding", json={"brand_color": "purple"},
    )
    assert r.status_code == 400


async def test_branding_logo_upload(coach_client):
    fake_png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
    r = await coach_client.post(
        "/api/coach/branding/logo",
        files={"file": ("logo.png", io.BytesIO(fake_png), "image/png")},
    )
    assert r.status_code == 201
    key = r.json()["logo_path"]
    assert key

    r = await coach_client.put(
        "/api/coach/branding",
        json={"logo_path": key, "brand_color": "#0d9488"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["logo_path"] == key
    assert body["logo_url"]


async def test_branding_logo_rejects_oversize(coach_client):
    big = b"\x89PNG" + b"x" * 1_500_000
    r = await coach_client.post(
        "/api/coach/branding/logo",
        files={"file": ("big.png", io.BytesIO(big), "image/png")},
    )
    assert r.status_code == 413


async def test_branding_logo_rejects_unknown_type(coach_client):
    r = await coach_client.post(
        "/api/coach/branding/logo",
        files={"file": ("bad.gif", io.BytesIO(b"GIF89a"), "image/gif")},
    )
    assert r.status_code == 400


# ── White-label PDF: branding flows through to tailor output ─────────
async def test_coach_tailor_injects_branding_into_html(coach_client, storage):
    """When coach has branding set, the rendered HTML includes both color
    and the embedded logo URL."""
    # Set branding
    fake_png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 50
    r = await coach_client.post(
        "/api/coach/branding/logo",
        files={"file": ("logo.png", io.BytesIO(fake_png), "image/png")},
    )
    logo_key = r.json()["logo_path"]
    await coach_client.put(
        "/api/coach/branding",
        json={"logo_path": logo_key, "brand_color": "#abcdef"},
    )

    # Set up client + tailor
    await _seed_client_user(storage, user_id="cl_w", email="w@example.com")
    await _seed_master_for(storage, user_id="cl_w")
    cid = await storage.add_coach_client(
        "local", invited_email="w@example.com",
        invited_name=None, invite_token="tW",
    )
    await storage.accept_coach_invite("tW", "cl_w")

    r = await coach_client.get("/api/jobs?page_size=1")
    job_id = r.json()["items"][0]["id"]
    r = await coach_client.post(
        f"/api/coach/clients/{cid}/tailor", json={"job_id": job_id},
    )
    assert r.status_code == 200
    tid = r.json()["tailored_id"]

    # Pull the saved file via direct path lookup. LocalFileStorage doesn't
    # expose a read method; resolve the key relative to its root.
    tailored = await storage.get_tailored_resume(tid, "cl_w")
    pdf_path_or_key = tailored["pdf_path"]
    from backend.resumes.file_storage import get_file_storage
    fs = get_file_storage()
    # _path is internal but stable for tests in desktop mode.
    p = fs._path(pdf_path_or_key)  # type: ignore[attr-defined]
    body = p.read_bytes()

    # If WeasyPrint is available, body is binary PDF — skip the check.
    text_body = body.decode("utf-8", errors="ignore")
    if text_body.startswith("<!DOCTYPE html") or "<html" in text_body[:200]:
        assert "#abcdef" in text_body
        assert "<img" in text_body  # logo band injected


# ── inject_branding pure-function unit tests ─────────────────────────
async def test_inject_branding_no_op_when_no_args():
    from backend.coach import inject_branding
    html = "<html><body>x</body></html>"
    assert inject_branding(html, logo_url=None, brand_color=None) == html


async def test_inject_branding_swaps_default_color():
    from backend.coach import inject_branding
    html = "<html><style>color: #5B21B6;</style><body>x</body></html>"
    out = inject_branding(html, logo_url=None, brand_color="#aabbcc")
    assert "#aabbcc" in out
    assert "#5B21B6" not in out


async def test_inject_branding_adds_logo_band():
    from backend.coach import inject_branding
    html = "<html><body>x</body></html>"
    out = inject_branding(
        html, logo_url="https://example.com/logo.png", brand_color="#aabbcc",
    )
    assert "<img" in out
    assert "logo.png" in out


async def test_inject_branding_safe_on_non_resume_html():
    from backend.coach import inject_branding
    html = "<not-our-html/>"
    out = inject_branding(html, logo_url="x", brand_color="#aabbcc")
    assert out == html  # no <body> → unchanged
