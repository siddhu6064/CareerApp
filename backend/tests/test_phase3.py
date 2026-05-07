"""Phase 3 tests: Supabase JWT middleware + user preferences endpoint.

JWT tests run in both modes:
  - No secret (dev stub): any bearer accepted, user_id = "dev-{token[:8]}"
  - With secret: proper HS256 decode, expiry, audience, sub checks

The preferences endpoint test runs in desktop mode (existing test infra).
"""
from __future__ import annotations

import time

import pytest

# Only the endpoint tests need asyncio — the JWT unit tests are plain sync.


# ── JWT verifier unit tests ───────────────────────────────────────────

def _make_token(secret: str, sub: str = "user-123", aud: str = "authenticated",
                exp_delta: int = 3600) -> str:
    import jwt
    now = int(time.time())
    return jwt.encode(
        {"sub": sub, "aud": aud, "iat": now, "exp": now + exp_delta, "role": "authenticated"},
        secret,
        algorithm="HS256",
    )


def test_jwt_decode_valid_token():
    from backend.auth.supabase_jwt import _decode_supabase_jwt
    from unittest.mock import patch

    secret = "super-secret-jwt-key-for-testing"
    token = _make_token(secret)

    with patch("backend.config.SUPABASE_JWT_SECRET", secret):
        user_id = _decode_supabase_jwt(token)

    assert user_id == "user-123"


def test_jwt_decode_expired_token():
    from fastapi import HTTPException
    from backend.auth.supabase_jwt import _decode_supabase_jwt
    from unittest.mock import patch

    secret = "super-secret-jwt-key-for-testing"
    token = _make_token(secret, exp_delta=-10)  # already expired

    with patch("backend.config.SUPABASE_JWT_SECRET", secret):
        with pytest.raises(HTTPException) as exc_info:
            _decode_supabase_jwt(token)

    assert exc_info.value.status_code == 401
    assert "expired" in exc_info.value.detail


def test_jwt_decode_wrong_secret():
    from fastapi import HTTPException
    from backend.auth.supabase_jwt import _decode_supabase_jwt
    from unittest.mock import patch

    token = _make_token("correct-secret")

    with patch("backend.config.SUPABASE_JWT_SECRET", "wrong-secret"):
        with pytest.raises(HTTPException) as exc_info:
            _decode_supabase_jwt(token)

    assert exc_info.value.status_code == 401


def test_jwt_decode_wrong_audience():
    from fastapi import HTTPException
    from backend.auth.supabase_jwt import _decode_supabase_jwt
    from unittest.mock import patch

    secret = "some-secret"
    token = _make_token(secret, aud="service_role")  # wrong audience

    with patch("backend.config.SUPABASE_JWT_SECRET", secret):
        with pytest.raises(HTTPException) as exc_info:
            _decode_supabase_jwt(token)

    assert exc_info.value.status_code == 401


def test_jwt_decode_garbage_token():
    from fastapi import HTTPException
    from backend.auth.supabase_jwt import _decode_supabase_jwt
    from unittest.mock import patch

    with patch("backend.config.SUPABASE_JWT_SECRET", "some-secret"):
        with pytest.raises(HTTPException) as exc_info:
            _decode_supabase_jwt("not.a.jwt")

    assert exc_info.value.status_code == 401


def test_jwt_dev_stub_no_secret():
    """When SUPABASE_JWT_SECRET is empty, fall back to dev stub."""
    from backend.auth.supabase_jwt import _decode_supabase_jwt
    from unittest.mock import patch

    with patch("backend.config.SUPABASE_JWT_SECRET", ""):
        user_id = _decode_supabase_jwt("sometoken12345678")

    assert user_id.startswith("dev-")
    assert "sometoke" in user_id  # first 8 chars


# ── Preferences endpoint tests ────────────────────────────────────────

@pytest.fixture
async def client(storage):
    from backend.main import app
    from httpx import ASGITransport, AsyncClient

    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test",
        ) as ac:
            yield ac


@pytest.mark.asyncio
async def test_put_preferences_updates_fields(client):
    from backend import config

    r = await client.put(
        "/api/me/preferences",
        json={"field": "Engineering", "level": "senior", "remote_pref": "remote", "location": "San Francisco"},
        headers={"Authorization": f"Bearer {config.LOCAL_API_TOKEN}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["field"] == "Engineering"
    assert body["level"] == "senior"
    assert body["remote_pref"] == "remote"
    assert body["location"] == "San Francisco"


@pytest.mark.asyncio
async def test_put_preferences_partial_update(client):
    from backend import config
    headers = {"Authorization": f"Bearer {config.LOCAL_API_TOKEN}"}

    # Set initial state
    await client.put("/api/me/preferences", json={"field": "Data", "level": "mid"}, headers=headers)

    # Partial update — only change field
    r = await client.put("/api/me/preferences", json={"field": "Product"}, headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["field"] == "Product"
    assert body["level"] == "mid"   # unchanged


@pytest.mark.asyncio
async def test_put_preferences_requires_auth(client):
    r = await client.put("/api/me/preferences", json={"field": "Engineering"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_put_preferences_clears_field(client):
    from backend import config
    headers = {"Authorization": f"Bearer {config.LOCAL_API_TOKEN}"}

    await client.put("/api/me/preferences", json={"field": "Engineering"}, headers=headers)

    # Clear by sending null
    r = await client.put("/api/me/preferences", json={"field": None}, headers=headers)
    assert r.status_code == 200
    assert r.json()["field"] is None


@pytest.mark.asyncio
async def test_get_me_returns_preferences(client):
    from backend import config
    headers = {"Authorization": f"Bearer {config.LOCAL_API_TOKEN}"}

    await client.put(
        "/api/me/preferences",
        json={"field": "Design", "level": "entry", "remote_pref": "hybrid"},
        headers=headers,
    )

    r = await client.get("/api/me", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["field"] == "Design"
    assert body["level"] == "entry"
    assert body["remote_pref"] == "hybrid"
