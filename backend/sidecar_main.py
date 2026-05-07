"""Phase 10.5 — FastAPI sidecar entry point.

Tauri spawns this binary with `--host 127.0.0.1 --port <free-port>`. We
launch uvicorn programmatically so the per-launch token (printed in
main.py's lifespan) reaches Tauri via stdout in a known format.

Why not just `uvicorn backend.main:app`? Because the bundled exe doesn't
have a uvicorn console script — we have to import + call programmatically.
"""
from __future__ import annotations

import argparse
import os
import sys


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="appname-server")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--log-level", default="info")
    return p.parse_args()


def main() -> None:
    args = _parse_args()

    # Force desktop mode in the sidecar binary. The SaaS bundle uses
    # APPNAME_MODE=saas via render.yaml — never via this entry point.
    os.environ.setdefault("APPNAME_MODE", "desktop")

    # Default stubs OFF in production desktop bundle. Devs can override
    # with env vars when running the spec build for testing.
    # (No-op — just documenting.)

    import uvicorn
    # Avoid "address already in use" on rapid restarts (Tauri restarts the
    # sidecar on app reload).
    uvicorn.run(
        "backend.main:app",
        host=args.host,
        port=args.port,
        log_level=args.log_level,
        access_log=False,
        # Loop=auto picks uvloop on Linux/macOS, asyncio on Windows.
        loop="auto",
    )


if __name__ == "__main__":
    main()
