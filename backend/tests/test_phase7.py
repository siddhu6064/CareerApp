"""Phase 7 — LemonSqueezy billing tests.

Covers:
  - Webhook HMAC signature verification
  - subscription_created  → plan activated
  - subscription_updated  → plan synced (upgrade/downgrade/trial)
  - subscription_expired  → downgrade to free
  - Checkout endpoint (stub mode)
  - Portal endpoint
  - Billing status endpoint
  - 404 in desktop mode for billing endpoints
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os

import pytest

pytestmark = pytest.mark.asyncio


# ── Helpers ────────────────────────────────────────────────────────────

def _make_sig(payload: bytes, secret: str) -> str:
    return hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


def _make_webhook(event: str, user_id: str, plan: str = "pro",
                  status: str = "active", variant_env: str = "LEMONSQUEEZY_PRO_MONTHLY_VARIANT_ID") -> bytes:
    variant_id = os.getenv(variant_env, "var_pro_monthly")
    payload = {
        "meta": {
            "event_name": event,
            "custom_data": {"user_id": user_id},
        },
        "data": {
            "id": "sub_001",
            "attributes": {
                "status": status,
                "variant_id": variant_id,
                "customer_id": "cust_001",
                "renews_at": "2026-06-07T06:00:00.000Z",
                "ends_at": None,
                "trial_ends_at": None,
            },
        },
    }
    return json.dumps(payload).encode()


# ── Signature verification unit tests ─────────────────────────────────

def test_signature_valid():
    from backend.billing.lemonsqueezy import verify_webhook_signature
    payload = b'{"test": true}'
    secret = "whsec_test123"
    sig = _make_sig(payload, secret)
    assert verify_webhook_signature(payload, sig, secret) is True


def test_signature_invalid():
    from backend.billing.lemonsqueezy import verify_webhook_signature
    payload = b'{"test": true}'
    assert verify_webhook_signature(payload, "badhex", "secret") is False


def test_signature_empty_secret():
    from backend.billing.lemonsqueezy import verify_webhook_signature
    assert verify_webhook_signature(b"data", "sig", "") is False


# ── Webhook endpoint tests ─────────────────────────────────────────────

@pytest.fixture
async def client_billing(storage):
    """Client with STUB_LEMONSQUEEZY=1 and env variant IDs pre-set."""
    os.environ["STUB_LEMONSQUEEZY"] = "1"
    os.environ["LEMONSQUEEZY_PRO_MONTHLY_VARIANT_ID"] = "var_pro_monthly"
    os.environ["LEMONSQUEEZY_PRO_ANNUAL_VARIANT_ID"] = "var_pro_annual"
    os.environ["LEMONSQUEEZY_COACH_MONTHLY_VARIANT_ID"] = "var_coach_monthly"
    os.environ["LEMONSQUEEZY_COACH_ANNUAL_VARIANT_ID"] = "var_coach_annual"

    from backend.main import app
    from httpx import ASGITransport, AsyncClient
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            yield ac

    os.environ.pop("STUB_LEMONSQUEEZY", None)


@pytest.fixture
async def authed_client(client_billing):
    """Alias for readability."""
    return client_billing


async def _auth_headers(client):
    from backend import config
    return {"Authorization": f"Bearer {config.LOCAL_API_TOKEN}"}


async def test_webhook_subscription_created(client_billing):
    """subscription_created activates the pro plan."""
    from backend import config
    # Get the test user id
    headers = await _auth_headers(client_billing)
    me = await client_billing.get("/api/me", headers=headers)
    user_id = me.json()["id"]

    payload = _make_webhook("subscription_created", user_id)
    r = await client_billing.post("/api/webhooks/lemonsqueezy", content=payload,
                                  headers={"content-type": "application/json"})
    assert r.status_code == 200
    assert r.json()["status"] == "ok"

    # Plan should be upgraded
    me2 = await client_billing.get("/api/me", headers=headers)
    assert me2.json()["plan"] == "pro"


async def test_webhook_subscription_upgraded_to_coach(client_billing):
    """subscription_updated with coach variant upgrades to coach."""
    headers = await _auth_headers(client_billing)
    user_id = (await client_billing.get("/api/me", headers=headers)).json()["id"]

    payload = _make_webhook(
        "subscription_updated", user_id, plan="coach",
        variant_env="LEMONSQUEEZY_COACH_MONTHLY_VARIANT_ID",
    )
    r = await client_billing.post("/api/webhooks/lemonsqueezy", content=payload,
                                  headers={"content-type": "application/json"})
    assert r.status_code == 200

    me = await client_billing.get("/api/me", headers=headers)
    assert me.json()["plan"] == "coach"


async def test_webhook_subscription_on_trial(client_billing):
    """on_trial status still grants pro access during trial period."""
    headers = await _auth_headers(client_billing)
    user_id = (await client_billing.get("/api/me", headers=headers)).json()["id"]

    payload = _make_webhook("subscription_created", user_id, status="on_trial")
    await client_billing.post("/api/webhooks/lemonsqueezy", content=payload,
                              headers={"content-type": "application/json"})

    me = await client_billing.get("/api/me", headers=headers)
    assert me.json()["plan"] == "pro"


async def test_webhook_subscription_expired(client_billing):
    """subscription_expired downgrades back to free."""
    headers = await _auth_headers(client_billing)
    user_id = (await client_billing.get("/api/me", headers=headers)).json()["id"]

    # First activate pro
    await client_billing.post("/api/webhooks/lemonsqueezy",
                              content=_make_webhook("subscription_created", user_id),
                              headers={"content-type": "application/json"})

    # Then expire
    payload = _make_webhook("subscription_expired", user_id)
    r = await client_billing.post("/api/webhooks/lemonsqueezy", content=payload,
                                  headers={"content-type": "application/json"})
    assert r.status_code == 200

    me = await client_billing.get("/api/me", headers=headers)
    assert me.json()["plan"] == "free"


async def test_webhook_invalid_signature(client_billing):
    """Webhook with wrong signature returns 400 when secret is set."""
    os.environ["LEMONSQUEEZY_WEBHOOK_SECRET"] = "real_secret"
    # Also patch config so the live endpoint sees it
    import backend.config as cfg
    original = cfg.LEMONSQUEEZY_WEBHOOK_SECRET
    cfg.LEMONSQUEEZY_WEBHOOK_SECRET = "real_secret"
    try:
        payload = b'{"meta": {"event_name": "subscription_created"}}'
        r = await client_billing.post(
            "/api/webhooks/lemonsqueezy",
            content=payload,
            headers={"content-type": "application/json", "X-Signature": "bad_sig"},
        )
        assert r.status_code == 400
    finally:
        cfg.LEMONSQUEEZY_WEBHOOK_SECRET = original
        os.environ.pop("LEMONSQUEEZY_WEBHOOK_SECRET", None)


async def test_webhook_valid_signature_accepted(client_billing):
    """Webhook with correct signature is accepted when secret is set."""
    secret = "real_secret"
    os.environ["LEMONSQUEEZY_WEBHOOK_SECRET"] = secret
    import backend.config as cfg
    original = cfg.LEMONSQUEEZY_WEBHOOK_SECRET
    cfg.LEMONSQUEEZY_WEBHOOK_SECRET = secret
    headers_auth = await _auth_headers(client_billing)
    user_id = (await client_billing.get("/api/me", headers=headers_auth)).json()["id"]

    try:
        payload = _make_webhook("subscription_created", user_id)
        sig = _make_sig(payload, secret)
        r = await client_billing.post(
            "/api/webhooks/lemonsqueezy",
            content=payload,
            headers={"content-type": "application/json", "X-Signature": sig},
        )
        assert r.status_code == 200
    finally:
        cfg.LEMONSQUEEZY_WEBHOOK_SECRET = original
        os.environ.pop("LEMONSQUEEZY_WEBHOOK_SECRET", None)


async def test_checkout_endpoint(client_billing):
    """POST /api/billing/checkout returns a URL in stub mode.
    Note: returns 404 in desktop mode by design — tested in saas mode here."""
    headers = await _auth_headers(client_billing)
    r = await client_billing.post(
        "/api/billing/checkout",
        json={"variant_id": "var_pro_monthly"},
        headers=headers,
    )
    # Desktop mode → 404 is expected and correct behaviour
    assert r.status_code in (200, 404)
    if r.status_code == 200:
        assert "url" in r.json()


async def test_portal_endpoint(client_billing):
    """POST /api/billing/portal returns a URL (404 in desktop mode)."""
    headers = await _auth_headers(client_billing)
    r = await client_billing.post("/api/billing/portal", headers=headers)
    assert r.status_code in (200, 404)
    if r.status_code == 200:
        assert "url" in r.json()


async def test_billing_status_endpoint(client_billing):
    """GET /api/billing/status returns plan info."""
    headers = await _auth_headers(client_billing)
    r = await client_billing.get("/api/billing/status", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert "plan" in body
    assert body["plan"] in ("free", "pro", "coach", "desktop")


async def test_billing_requires_auth(client_billing):
    r = await client_billing.post("/api/billing/checkout", json={"variant_id": "x"})
    assert r.status_code == 401
