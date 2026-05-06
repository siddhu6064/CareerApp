"""File storage abstraction. Desktop = local FS. SaaS = Cloudflare R2 (stub).

Same shape as StorageAdapter — mode-aware factory, never called directly.
"""
from __future__ import annotations

import shutil
import uuid
from abc import ABC, abstractmethod
from pathlib import Path

from backend import config


class FileStorageAdapter(ABC):
    @abstractmethod
    async def save(self, src_bytes: bytes, *, key: str, content_type: str) -> str:
        """Persist bytes under `key`. Returns adapter-specific path/URL."""

    @abstractmethod
    async def get_signed_url(self, key: str, *, ttl_seconds: int = 3600) -> str:
        """Return a download URL. Local FS returns a `file://` URL."""

    @abstractmethod
    async def delete(self, key: str) -> bool:
        ...


class LocalFileStorage(FileStorageAdapter):
    def __init__(self, root: Path):
        self._root = root
        self._root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        # Disallow path traversal
        clean = key.replace("..", "_").lstrip("/")
        p = self._root / clean
        p.parent.mkdir(parents=True, exist_ok=True)
        return p

    async def save(self, src_bytes: bytes, *, key: str, content_type: str) -> str:
        p = self._path(key)
        p.write_bytes(src_bytes)
        # Return the key (not absolute path) so callers store something stable
        # that get_signed_url can re-resolve. R2 will do the same.
        return key

    async def get_signed_url(self, key: str, *, ttl_seconds: int = 3600) -> str:
        return f"file://{self._path(key)}"

    async def delete(self, key: str) -> bool:
        p = self._path(key)
        if p.exists():
            p.unlink()
            return True
        return False


class R2FileStorage(FileStorageAdapter):
    """Cloudflare R2 — stub until SaaS account is provisioned."""

    def __init__(self, bucket: str, access_key: str, secret_key: str, endpoint: str):
        if not all([bucket, access_key, secret_key, endpoint]):
            raise RuntimeError(
                "R2FileStorage requires R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT. "
                "For local dev set APPNAME_MODE=desktop."
            )
        self._bucket = bucket
        self._access_key = access_key
        self._secret_key = secret_key
        self._endpoint = endpoint

    async def save(self, src_bytes: bytes, *, key: str, content_type: str) -> str:
        raise NotImplementedError("R2 implementation lands when account is provisioned")

    async def get_signed_url(self, key: str, *, ttl_seconds: int = 3600) -> str:
        raise NotImplementedError

    async def delete(self, key: str) -> bool:
        raise NotImplementedError


_singleton: FileStorageAdapter | None = None


def get_file_storage() -> FileStorageAdapter:
    global _singleton
    if _singleton is None:
        if config.is_desktop():
            _singleton = LocalFileStorage(root=config.DESKTOP_DATA_DIR / "files")
        else:
            import os
            _singleton = R2FileStorage(
                bucket=os.getenv("R2_BUCKET", ""),
                access_key=os.getenv("R2_ACCESS_KEY_ID", ""),
                secret_key=os.getenv("R2_SECRET_ACCESS_KEY", ""),
                endpoint=os.getenv("R2_ENDPOINT", ""),
            )
    return _singleton


def reset_file_storage_for_tests() -> None:
    global _singleton
    _singleton = None


def make_resume_key(user_id: str, suffix: str = "pdf") -> str:
    return f"resumes/{user_id}/{uuid.uuid4().hex}.{suffix}"
