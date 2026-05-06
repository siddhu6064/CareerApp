"""Supabase JWT verifier — SaaS mode only.

Stub for Phase 1. Real impl uses python-jose to verify the JWT against
SUPABASE_JWT_SECRET (HS256), extracts sub claim as user_id.

For local dev without Supabase signup: set APPNAME_MODE=desktop and use
local_token auth instead.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend import config

_bearer = HTTPBearer(auto_error=False)


async def require_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    if creds is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing bearer token",
        )

    if not config.SUPABASE_JWT_SECRET:
        # Phase 1 stub — accept any non-empty bearer as a placeholder user_id
        # so we can develop endpoints before Supabase is provisioned.
        # Remove this branch once Supabase project exists.
        return f"dev-{creds.credentials[:8]}"

    # TODO Phase 1.x — real verification:
    # from jose import jwt
    # payload = jwt.decode(creds.credentials, config.SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated")
    # return payload["sub"]
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Supabase JWT verification not yet implemented",
    )
