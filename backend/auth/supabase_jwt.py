"""Supabase JWT verifier — SaaS mode only.

Supabase issues HS256 JWTs signed with the project's JWT secret:
  Header: { alg: "HS256", typ: "JWT" }
  Payload: { sub: "<user_uuid>", role: "authenticated", email: "...",
             aud: "authenticated", exp: <unix_ts>, iat: <unix_ts> }

Required env vars (set in Render + .env.local):
  SUPABASE_JWT_SECRET   — from Supabase Dashboard → Project Settings → API → JWT Secret

Falls back to a permissive dev stub when the secret is not set, so existing
desktop-mode tests continue to work without Supabase credentials.

python-jose and PyJWT both decode HS256; we use PyJWT (already a transitive dep
via fastapi/uvicorn toolchain, no new install needed).
"""
from __future__ import annotations

import logging

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend import config

log = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=False)


def _decode_supabase_jwt(token: str) -> str:
    """Decode a Supabase-issued JWT and return the user_id (sub claim).
    Raises HTTPException on any verification failure.
    """
    import jwt  # PyJWT — available in the runtime (installed by uvicorn[standard])

    secret = config.SUPABASE_JWT_SECRET
    if not secret:
        # Dev stub: secret not configured yet — accept any syntactically valid
        # bearer token and use the first 8 chars as a fake user_id.
        # REMOVE this branch (or hard-error) once the Supabase project exists.
        log.warning(
            "SUPABASE_JWT_SECRET not set — using permissive dev stub. "
            "Set the secret before deploying to production."
        )
        return f"dev-{token[:8]}"

    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience="authenticated",
            options={"require": ["sub", "exp"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="token expired",
        )
    except jwt.InvalidAudienceError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid token audience",
        )
    except jwt.DecodeError as exc:
        log.debug("JWT decode error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid token",
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("Unexpected JWT error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid token",
        )

    user_id: str | None = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="token missing sub claim",
        )
    return user_id


async def require_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    if creds is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing bearer token",
        )
    return _decode_supabase_jwt(creds.credentials)
