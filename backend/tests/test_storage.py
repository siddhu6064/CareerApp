"""Storage adapter contract tests. Both SupabaseAdapter and SqliteAdapter must
pass these — that's the whole point of the abstraction.

Currently runs against SqliteAdapter only. When SupabaseAdapter is implemented,
parametrize the storage fixture to run the same suite against both.
"""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio


async def test_healthcheck_returns_adapter_info(storage):
    info = await storage.healthcheck()
    assert info["adapter"] == "sqlite"
    assert info["schema_version"] is not None


async def test_upsert_then_get_user(storage):
    user = await storage.upsert_user("u1", "alice@example.com", plan="free")
    assert user["id"] == "u1"
    assert user["email"] == "alice@example.com"
    assert user["plan"] == "free"
    assert user["tailor_count_month"] == 0

    fetched = await storage.get_user("u1")
    assert fetched is not None
    assert fetched["email"] == "alice@example.com"


async def test_get_unknown_user_returns_none(storage):
    assert await storage.get_user("does-not-exist") is None


async def test_upsert_user_is_idempotent(storage):
    await storage.upsert_user("u1", "alice@example.com", plan="free")
    await storage.upsert_user("u1", "alice@new.com", plan="pro")

    user = await storage.get_user("u1")
    assert user["email"] == "alice@new.com"
    assert user["plan"] == "pro"


async def test_increment_tailor_count(storage):
    await storage.upsert_user("u1", "alice@example.com")
    assert await storage.increment_tailor_count("u1") == 1
    assert await storage.increment_tailor_count("u1") == 2
    assert await storage.increment_tailor_count("u1") == 3

    user = await storage.get_user("u1")
    assert user["tailor_count_month"] == 3


async def test_settings_kv(storage):
    assert await storage.get_setting("anthropic_key") is None

    await storage.set_setting("anthropic_key", "sk-ant-test-123")
    assert await storage.get_setting("anthropic_key") == "sk-ant-test-123"

    # Upsert overwrites
    await storage.set_setting("anthropic_key", "sk-ant-test-456")
    assert await storage.get_setting("anthropic_key") == "sk-ant-test-456"
