"""API integration tests. Runs the real FastAPI app against the SqliteAdapter."""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def client(storage):
    """ASGI client. The `storage` fixture ensures DB is initialized first."""
    from backend.main import app

    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as ac:
            yield ac


async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["mode"] == "desktop"
    assert body["storage"]["adapter"] == "sqlite"


async def test_me_requires_auth(client):
    r = await client.get("/api/me")
    assert r.status_code == 401


async def test_me_with_local_token(client):
    from backend import config

    r = await client.get(
        "/api/me",
        headers={"Authorization": f"Bearer {config.LOCAL_API_TOKEN}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "local"
    assert body["email"] == "local@desktop"
    assert body["plan"] == "desktop"
    assert body["tailor_count_month"] == 0


async def test_me_rejects_bad_token(client):
    r = await client.get(
        "/api/me",
        headers={"Authorization": "Bearer nope-this-is-wrong"},
    )
    assert r.status_code == 401
