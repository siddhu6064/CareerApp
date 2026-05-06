"""In-memory TTL cache for the public /api/jobs feed.

PRD §7: cachetools sufficient until horizontal scaling. Add Upstash Redis when
needed. Single-process invalidation only — fine for Render single-instance.
"""
from __future__ import annotations

import time
from threading import RLock
from typing import Any


class TTLCache:
    def __init__(self, default_ttl_seconds: int = 3600):
        self._store: dict[str, tuple[float, Any]] = {}
        self._ttl = default_ttl_seconds
        self._lock = RLock()

    def get(self, key: str) -> Any | None:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            expires_at, value = entry
            if expires_at < time.monotonic():
                del self._store[key]
                return None
            return value

    def set(self, key: str, value: Any, ttl_seconds: int | None = None) -> None:
        with self._lock:
            ttl = ttl_seconds if ttl_seconds is not None else self._ttl
            self._store[key] = (time.monotonic() + ttl, value)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    def __len__(self) -> int:
        with self._lock:
            return len(self._store)


# Module-level singleton — invalidated by /internal/jobs/fetch
job_feed_cache = TTLCache(default_ttl_seconds=3600)
