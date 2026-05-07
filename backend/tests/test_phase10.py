"""Phase 10 — Desktop variant: BYOK, source adapters, manual fetch."""
from __future__ import annotations

import os

import pytest
from httpx import ASGITransport, AsyncClient

os.environ["STUB_ANTHROPIC"] = "1"
os.environ["STUB_JOBS_API"] = "1"
os.environ["APPNAME_DISABLE_SCHEDULER"] = "1"

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


# ── 10.3: BYOK keys ──────────────────────────────────────────────────
async def test_get_keys_empty_initially(auth_client):
    r = await auth_client.get("/api/settings/keys")
    assert r.status_code == 200
    body = r.json()
    assert body["anthropic"]["set"] is False
    assert body["github"]["set"] is False


async def test_put_anthropic_key_persists(auth_client, storage):
    r = await auth_client.put(
        "/api/settings/keys/anthropic",
        json={"api_key": "sk-ant-api03-test-key-aaaaaaaaaaaaaa"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["set"] is True
    assert r.json()["key_preview"].startswith("sk-ant-")

    # Confirms it's in settings
    stored = await storage.get_setting("anthropic_api_key")
    assert stored == "sk-ant-api03-test-key-aaaaaaaaaaaaaa"


async def test_put_anthropic_key_rejects_short(auth_client):
    r = await auth_client.put(
        "/api/settings/keys/anthropic", json={"api_key": "abc"},
    )
    assert r.status_code == 400


async def test_put_anthropic_key_rejects_empty(auth_client):
    r = await auth_client.put(
        "/api/settings/keys/anthropic", json={"api_key": "   "},
    )
    assert r.status_code == 400


async def test_delete_anthropic_key(auth_client, storage):
    await auth_client.put(
        "/api/settings/keys/anthropic",
        json={"api_key": "sk-ant-api03-test-key-aaaaaaaaaaaaaa"},
    )
    r = await auth_client.delete("/api/settings/keys/anthropic")
    assert r.status_code == 204

    r = await auth_client.get("/api/settings/keys")
    assert r.json()["anthropic"]["set"] is False


async def test_put_github_token_persists(auth_client):
    r = await auth_client.put(
        "/api/settings/keys/github", json={"api_key": "ghp_test_token_12345"},
    )
    assert r.status_code == 200
    assert r.json()["set"] is True


async def test_validate_keys_returns_stub_ok(auth_client):
    """STUB_ANTHROPIC=1 → validate returns ok=True without calling Anthropic."""
    await auth_client.put(
        "/api/settings/keys/anthropic",
        json={"api_key": "sk-ant-api03-test-key-aaaaaaaaaaaaaa"},
    )
    r = await auth_client.post("/api/settings/keys/validate")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["anthropic"]["ok"] is True
    assert body["anthropic"]["model"] == "stub"
    # github not set → reports error
    assert body["github"]["ok"] is False


async def test_validate_keys_no_key_set(auth_client):
    r = await auth_client.post("/api/settings/keys/validate")
    assert r.status_code == 200
    body = r.json()
    assert body["anthropic"]["ok"] is False


# ── 10.4: Source adapters (orchestrator) ─────────────────────────────
async def test_fetch_all_sources_uses_defaults_on_empty_settings(storage):
    """No settings keys configured → orchestrator uses default slug list."""
    from backend.agents.sources import fetch_all_sources
    leads = await fetch_all_sources(storage)
    # Greenhouse + lever + ashby defaults populated → should fetch
    assert len(leads) > 0
    sources = {l["source"] for l in leads}
    assert "greenhouse" in sources


async def test_fetch_all_sources_respects_settings(storage):
    """Setting sources.greenhouse to 1 slug should produce 12 fixtures total
    (all other sources blanked)."""
    await storage.set_setting("sources.greenhouse", "openai")
    await storage.set_setting("sources.lever", "")
    await storage.set_setting("sources.ashby", "")
    await storage.set_setting("sources.workable", "")

    from backend.agents.sources import fetch_all_sources
    leads = await fetch_all_sources(storage)
    assert len(leads) == 12
    assert all(l["source"] == "greenhouse" for l in leads)
    assert all(l["company"] == "openai" for l in leads)


async def test_fetch_all_sources_empty_when_all_blank(storage):
    for source in ("greenhouse", "lever", "ashby", "workable"):
        await storage.set_setting(f"sources.{source}", "")
    from backend.agents.sources import fetch_all_sources
    leads = await fetch_all_sources(storage)
    assert leads == []


async def test_greenhouse_normalize_strips_html():
    from backend.agents.sources.greenhouse import _normalize_greenhouse
    item = {
        "id": 123,
        "title": "Senior Engineer",
        "content": "<p>We&#39;re hiring</p><script>alert(1)</script>",
        "absolute_url": "https://example.com/job",
        "offices": [{"name": "Remote - US"}],
        "location": {"name": "San Francisco, CA"},
    }
    out = _normalize_greenhouse(item, "openai")
    assert out["source"] == "greenhouse"
    assert out["remote_type"] == "remote"
    assert "<p>" not in out["description"]
    assert "<script>" not in out["description"]


async def test_lever_normalize_remote_detection():
    from backend.agents.sources.lever import _normalize_lever
    item = {
        "id": "abc-123",
        "text": "Backend Engineer",
        "categories": {"location": "Remote", "commitment": "Full-time"},
        "workplaceType": "remote",
        "descriptionPlain": "Plain description",
        "hostedUrl": "https://example.com/apply",
    }
    out = _normalize_lever(item, "netflix")
    assert out["source"] == "lever"
    assert out["remote_type"] == "remote"
    assert out["employment_type"] == "Full-time"


async def test_ashby_normalize_workplace():
    from backend.agents.sources.ashby import _normalize_ashby
    item = {
        "id": "1",
        "title": "ML Engineer",
        "workplaceType": "Hybrid",
        "descriptionHtml": "<div>Body</div>",
        "jobUrl": "https://example.com",
        "publishedAt": "2024-01-01T00:00:00Z",
        "employmentType": "FullTime",
    }
    out = _normalize_ashby(item, "ramp")
    assert out["source"] == "ashby"
    assert out["remote_type"] == "hybrid"
    assert out["description"] == "Body"


async def test_workable_normalize():
    from backend.agents.sources.workable import _normalize_workable
    item = {
        "id": "wk1",
        "title": "DevOps",
        "description": "<p>Stuff</p>",
        "location": {"city": "NYC", "country": "USA"},
        "remote": True,
        "url": "https://example.com",
    }
    out = _normalize_workable(item, "examplecorp")
    assert out["source"] == "workable"
    assert out["remote_type"] == "remote"
    assert out["location"] == "NYC, USA"


# ── 10.6: Manual fetch endpoint ──────────────────────────────────────
async def test_fetch_now_runs_pipeline(auth_client, storage):
    # Pin to one source for deterministic count
    await storage.set_setting("sources.greenhouse", "openai")
    for s in ("lever", "ashby", "workable"):
        await storage.set_setting(f"sources.{s}", "")

    r = await auth_client.post("/api/jobs/fetch-now", json=["test"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["fetched"] == 12
    assert body["inserted"] >= 8
    assert "expired_marked" in body


async def test_fetch_now_unauth_blocked(storage):
    from backend.main import app
    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            r = await ac.post("/api/jobs/fetch-now", json=[])
    assert r.status_code == 401


# ── llm.py BYOK helper unit tests ────────────────────────────────────
async def test_get_anthropic_api_key_env_wins(storage, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "env-key")
    await storage.set_setting("anthropic_api_key", "settings-key")
    from backend import llm
    assert await llm.get_anthropic_api_key(storage) == "env-key"


async def test_get_anthropic_api_key_falls_back_to_settings(storage, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    await storage.set_setting("anthropic_api_key", "settings-key")
    from backend import llm
    assert await llm.get_anthropic_api_key(storage) == "settings-key"


async def test_get_anthropic_api_key_returns_empty_when_neither(storage, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    from backend import llm
    assert await llm.get_anthropic_api_key(storage) == ""


# ── Lifespan loads BYOK key into env ─────────────────────────────────
async def test_lifespan_injects_anthropic_key_from_settings(storage, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    await storage.set_setting("anthropic_api_key", "lifespan-test-key")

    from backend.main import app
    async with app.router.lifespan_context(app):
        # After lifespan startup, env var should be populated
        assert os.environ.get("ANTHROPIC_API_KEY") == "lifespan-test-key"
