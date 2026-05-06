"""Auth dependency factory. SaaS uses Supabase JWT; Desktop uses local bearer token.

Endpoint code:
    from backend.auth import require_user
    @app.get("/api/me")
    async def me(user_id: str = Depends(require_user)):
        ...

The actual dependency function is selected by config.APPNAME_MODE. Endpoints
never reference Supabase-specific or local-token-specific code directly.
"""
from __future__ import annotations

from backend import config

if config.is_desktop():
    from backend.auth.local_token import require_user
else:
    from backend.auth.supabase_jwt import require_user

__all__ = ["require_user"]
