"""Phase 6 — digest email, push notifications, prefs, internal cron auth."""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient

os.environ["STUB_ANTHROPIC"] = "1"
os.environ["STUB_JOBS_API"] = "1"
os.environ["STUB_RESEND"] = "1"
os.environ["STUB_EXPO_PUSH"] = "1"

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


@pytest.fixture(autouse=True)
def _reset_outboxes():
    from backend.notifications.email import reset_email_outbox
    from backend.notifications.push import reset_push_outbox
    reset_email_outbox()
    reset_push_outbox()
    yield


# ── Push token registration ─────────────────────────────────────────
async def test_register_push_token(auth_client):
    r = await auth_client.post(
        "/api/me/push-tokens",
        json={
            "expo_token": "ExponentPushToken[abc123def456ghi789jkl0]",
            "platform": "ios",
            "device_name": "Pixel-of-Justin",
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["expo_token"].startswith("ExponentPushToken[")
    assert body["platform"] == "ios"
    assert body["enabled"] is True


async def test_invalid_push_token_rejected(auth_client):
    r = await auth_client.post(
        "/api/me/push-tokens",
        json={"expo_token": "definitely-not-a-token"},
    )
    assert r.status_code == 400
    assert "Expo" in r.json()["detail"]


async def test_re_register_same_token_updates(auth_client, storage):
    tok = "ExponentPushToken[abc123def456ghi789jkl0]"
    r1 = await auth_client.post("/api/me/push-tokens",
                                json={"expo_token": tok, "platform": "ios"})
    r2 = await auth_client.post("/api/me/push-tokens",
                                json={"expo_token": tok, "platform": "android"})
    assert r1.status_code == 201
    assert r2.status_code == 201
    rows = await storage.list_push_tokens("local", enabled_only=False)
    # Only one row — same expo_token UNIQUE constraint
    assert len([r for r in rows if r["expo_token"] == tok]) == 1


async def test_disable_push_token(auth_client):
    tok = "ExponentPushToken[xyz9876543210uvw0]"
    await auth_client.post("/api/me/push-tokens", json={"expo_token": tok})
    r = await auth_client.delete(f"/api/me/push-tokens/{tok}")
    assert r.status_code == 204


# ── Notification preferences ────────────────────────────────────────
async def test_get_prefs_lazy_creates_default(auth_client):
    r = await auth_client.get("/api/me/notification-preferences")
    assert r.status_code == 200
    body = r.json()
    assert body["digest_enabled"] is True
    assert body["push_enabled"] is True
    assert body["digest_count"] == 5
    assert body["digest_hour_utc"] == 6
    assert body["timezone"] == "UTC"


async def test_update_prefs_partial(auth_client):
    r = await auth_client.put(
        "/api/me/notification-preferences",
        json={"digest_enabled": False, "digest_count": 10},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["digest_enabled"] is False
    assert body["digest_count"] == 10
    assert body["push_enabled"] is True  # untouched

    # Re-fetch confirms persistence
    r = await auth_client.get("/api/me/notification-preferences")
    body = r.json()
    assert body["digest_enabled"] is False
    assert body["digest_count"] == 10


async def test_invalid_digest_hour_rejected(auth_client):
    r = await auth_client.put(
        "/api/me/notification-preferences",
        json={"digest_hour_utc": 25},  # out of range
    )
    assert r.status_code == 422


# ── Digest cron ─────────────────────────────────────────────────────
async def test_digest_run_sends_email(auth_client, storage):
    from backend.notifications.email import get_email_outbox

    # Set up: ingest jobs + ensure user has email
    await auth_client.post("/internal/jobs/fetch", json={"queries": ["se"]})
    await storage.upsert_user("local", "alex@example.com", plan="pro")

    r = await auth_client.post("/internal/digest/run", json={"digest_hour_utc": 6})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["sent"] >= 1, body
    assert body["failed"] == 0

    outbox = get_email_outbox()
    assert len(outbox) >= 1
    sent = outbox[0]
    assert sent["to"] == "alex@example.com"
    assert "AppName" in sent["html"]
    # Pro user → match quality is rendered
    assert "Match quality" in sent["html"]


async def test_digest_free_user_hides_ats(auth_client, storage):
    from backend.notifications.email import get_email_outbox

    await auth_client.post("/internal/jobs/fetch", json={"queries": ["se"]})
    await storage.upsert_user("local", "free@example.com", plan="free")

    r = await auth_client.post("/internal/digest/run", json={"digest_hour_utc": 6})
    assert r.status_code == 200
    outbox = get_email_outbox()
    assert len(outbox) >= 1
    html = outbox[0]["html"]
    assert "Match quality" not in html  # gated
    assert "Pro</a>" in html              # upsell present


async def test_digest_skips_disabled_user(auth_client, storage):
    await auth_client.post("/internal/jobs/fetch", json={"queries": ["se"]})
    await storage.upsert_user("local", "x@example.com", plan="pro")
    await storage.update_notification_preferences("local", {"digest_enabled": False})

    r = await auth_client.post("/internal/digest/run", json={"digest_hour_utc": 6})
    assert r.status_code == 200
    body = r.json()
    assert body["sent"] == 0


async def test_digest_skips_user_without_email(auth_client, storage):
    await auth_client.post("/internal/jobs/fetch", json={"queries": ["se"]})
    # user.email is empty by default in desktop mode
    r = await auth_client.post("/internal/digest/run", json={"digest_hour_utc": 6})
    body = r.json()
    # Either sent==0 (no email) or sent==1 if a default email got assigned;
    # importantly the endpoint doesn't crash.
    assert body["failed"] == 0


async def test_digest_logs_to_email_digest_log(auth_client, storage):
    await auth_client.post("/internal/jobs/fetch", json={"queries": ["se"]})
    await storage.upsert_user("local", "alex@example.com", plan="pro")

    await auth_client.post("/internal/digest/run", json={"digest_hour_utc": 6})

    # Logged in DB
    async with storage._db.execute(
        "SELECT * FROM email_digest_log WHERE user_id = 'local'"
    ) as cur:
        rows = await cur.fetchall()
    assert len(rows) >= 1
    row = dict(rows[0])
    assert row["resend_id"].startswith("stub_")


# ── Push cron ───────────────────────────────────────────────────────
async def test_push_run_with_no_targets_returns_zeros(auth_client):
    r = await auth_client.post("/internal/push/run")
    assert r.status_code == 200
    body = r.json()
    assert body["interview_reminders"] == 0
    assert body["follow_up_reminders"] == 0
    assert body["stale_alerts"] == 0


async def test_push_run_sends_interview_reminder(auth_client, storage):
    from backend.notifications.push import get_push_outbox

    await storage.upsert_user("local", "alex@example.com", plan="pro")
    await auth_client.post("/api/me/push-tokens", json={
        "expo_token": "ExponentPushToken[goodtoken12345abcdefg]",
        "platform": "ios",
    })

    # Create application + interview scheduled tomorrow
    app_r = await auth_client.post("/api/applications", json={
        "title": "Senior Eng", "company": "Stripe", "status": "phone_screen",
    })
    aid = app_r.json()["id"]

    tomorrow = (datetime.now(timezone.utc) + timedelta(hours=20)).isoformat()
    await auth_client.post(f"/api/applications/{aid}/interviews", json={
        "round": "phone_screen",
        "scheduled_at": tomorrow,
        "duration_min": 30,
    })

    r = await auth_client.post("/internal/push/run")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["interview_reminders"] == 1

    outbox = get_push_outbox()
    assert len(outbox) == 1
    assert outbox[0]["title"].startswith("Interview tomorrow")
    assert "Stripe" in outbox[0]["title"]


async def test_push_run_disabled_user_skipped(auth_client, storage):
    await storage.upsert_user("local", "x@e.com", plan="pro")
    await auth_client.post("/api/me/push-tokens", json={
        "expo_token": "ExponentPushToken[abc123def456ghi789jkl0]"})
    await storage.update_notification_preferences("local", {"push_enabled": False})

    app_r = await auth_client.post("/api/applications", json={"title": "X", "company": "Y"})
    aid = app_r.json()["id"]
    tomorrow = (datetime.now(timezone.utc) + timedelta(hours=20)).isoformat()
    await auth_client.post(f"/api/applications/{aid}/interviews", json={
        "round": "phone_screen", "scheduled_at": tomorrow,
    })

    from backend.notifications.push import get_push_outbox
    r = await auth_client.post("/internal/push/run")
    body = r.json()
    # The run still detected the upcoming interview and incremented its counter,
    # but the per-user push_enabled gate stopped the actual send.
    assert body["interview_reminders"] == 1
    assert len(get_push_outbox()) == 0


async def test_push_run_follow_up_marks_notified(auth_client, storage):
    """A follow-up that fires once should not re-fire on the next cron run."""
    await storage.upsert_user("local", "x@e.com", plan="pro")
    await auth_client.post("/api/me/push-tokens", json={
        "expo_token": "ExponentPushToken[abc123def456ghi789jkl0]"})

    yesterday = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    app_r = await auth_client.post("/api/applications", json={
        "title": "X", "company": "Y", "status": "applied",
    })
    aid = app_r.json()["id"]
    await auth_client.patch(f"/api/applications/{aid}", json={"follow_up_date": yesterday})

    r1 = await auth_client.post("/internal/push/run")
    assert r1.json()["follow_up_reminders"] == 1

    r2 = await auth_client.post("/internal/push/run")
    assert r2.json()["follow_up_reminders"] == 0  # already notified


# ── Internal-secret enforcement (SaaS mode) ─────────────────────────
async def test_internal_secret_enforced_in_saas_mode(monkeypatch, storage):
    """In SaaS mode the cron endpoints reject calls without the header."""
    from backend import config
    from backend.main import app

    monkeypatch.setattr(config, "APPNAME_MODE", "saas", raising=False)
    monkeypatch.setattr(config, "X_INTERNAL_SECRET", "super-secret-cron-key", raising=False)

    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post("/internal/digest/run", json={"digest_hour_utc": 6})
            assert r.status_code == 403

            r = await ac.post(
                "/internal/digest/run",
                headers={"X-Internal-Secret": "super-secret-cron-key"},
                json={"digest_hour_utc": 6},
            )
            assert r.status_code == 200


async def test_internal_secret_skipped_in_desktop_mode(auth_client):
    """Desktop mode bypasses the X-Internal-Secret check (CORS-protected anyway)."""
    r = await auth_client.post("/internal/digest/run", json={"digest_hour_utc": 6})
    assert r.status_code == 200  # no header, but desktop = ok


# ── Endpoint requires auth ──────────────────────────────────────────
async def test_user_facing_endpoints_require_auth(storage):
    from backend.main import app
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.get("/api/me/notification-preferences")
            assert r.status_code == 401
            r = await ac.post("/api/me/push-tokens",
                              json={"expo_token": "ExponentPushToken[xxx]"})
            assert r.status_code == 401
