"""Local bearer token auth — desktop mode only.

A new token is generated each launch (config.LOCAL_API_TOKEN). Tauri reads it
from sidecar stdout and injects it into the web view at boot. Single-user
assumption: every authenticated request is the local user with id 'local'.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend import config

LOCAL_USER_ID = "local"

_bearer = HTTPBearer(auto_error=False)


async def require_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    if creds is None or creds.credentials != config.LOCAL_API_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid token",
        )
    return LOCAL_USER_ID
