"""Test fixtures. All tests run against SqliteAdapter on a per-test temp DB."""
from __future__ import annotations

import os

import pytest
import pytest_asyncio


@pytest_asyncio.fixture
async def storage(tmp_path, monkeypatch):
    """Fresh per-test DB. Resets the storage singleton + uses a unique path.

    Function-scoped so each test starts with an empty database. The singleton
    pattern in backend.storage requires a manual reset between tests.
    """
    monkeypatch.setenv("APPNAME_MODE", "desktop")
    monkeypatch.setenv("APPNAME_DATA_DIR", str(tmp_path))

    # Force re-read of config module-level constants by reloading it
    import importlib
    import backend.config
    importlib.reload(backend.config)

    from backend.storage import get_storage, reset_storage_for_tests
    from backend.resumes.file_storage import reset_file_storage_for_tests

    await reset_storage_for_tests()
    reset_file_storage_for_tests()
    s = get_storage()
    await s.connect()
    yield s
    await reset_storage_for_tests()
    reset_file_storage_for_tests()
