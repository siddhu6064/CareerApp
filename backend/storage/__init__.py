"""Storage adapter factory. Single entry point for all endpoints.

Endpoint code:
    from backend.storage import get_storage
    storage = get_storage()
    user = await storage.get_user(user_id)

Mode is selected by config.APPNAME_MODE — never call adapter implementations
directly from endpoint code. This is the v5.1 advisory enforcement point.
"""
from __future__ import annotations

from backend import config
from backend.storage.base import StorageAdapter

_singleton: StorageAdapter | None = None


def _build() -> StorageAdapter:
    if config.is_desktop():
        from backend.storage.sqlite_adapter import SqliteAdapter
        return SqliteAdapter(db_path=config.DESKTOP_DB_PATH)

    from backend.storage.supabase_adapter import SupabaseAdapter
    return SupabaseAdapter(
        url=config.SUPABASE_URL,
        service_key=config.SUPABASE_SERVICE_KEY,
    )


def get_storage() -> StorageAdapter:
    """Return the process-wide adapter singleton."""
    global _singleton
    if _singleton is None:
        _singleton = _build()
    return _singleton


async def reset_storage_for_tests() -> None:
    """Reset the singleton — used by pytest fixtures only. Never call in prod."""
    global _singleton
    if _singleton is not None:
        await _singleton.disconnect()
    _singleton = None


__all__ = ["StorageAdapter", "get_storage", "reset_storage_for_tests"]
