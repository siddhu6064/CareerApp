# PyInstaller spec for the AppName backend sidecar.
#
# Build:
#     pip install pyinstaller==6.10.0
#     pyinstaller backend/appname-server.spec --clean
#
# Output path:
#     dist/appname-server  (or .exe on Windows)
#
# Tauri sidecar convention requires the binary to be renamed with the host
# triple suffix before bundling. The build_sidecar.sh helper does that.
#
# Size: ~80–110 MB depending on platform (FastAPI + httpx + WeasyPrint deps).

# -*- mode: python ; coding: utf-8 -*-
import sys
from pathlib import Path

# Resolve repo root from the spec file location. PyInstaller runs the spec
# inside the cwd, so SPECPATH points at backend/.
project_root = Path(SPECPATH).parent.resolve()


a = Analysis(
    ['sidecar_main.py'],
    pathex=[str(project_root)],
    binaries=[],
    datas=[
        # SQLite schema must travel with the binary.
        ('storage/sqlite_schema.sql', 'backend/storage'),
        # Job-fetch fixture set (used when STUB_JOBS_API=1 — keep in desktop
        # build for the BYOK-onboarding flow + offline demo).
        ('jobs/fixtures', 'backend/jobs/fixtures'),
        # Resume-template HTML if present
    ],
    hiddenimports=[
        'aiosqlite',
        'apscheduler.executors.asyncio',
        'apscheduler.triggers.cron',
        'apscheduler.schedulers.asyncio',
        'tzlocal',
        'tzdata',
        'uvicorn.logging',
        'uvicorn.loops.auto',
        'uvicorn.loops.asyncio',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.httptools_impl',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.protocols.websockets.wsproto_impl',
        'uvicorn.protocols.websockets.websockets_impl',
        'uvicorn.lifespan.on',
        'uvicorn.lifespan.off',
        'anthropic',
        'httpx',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Don't ship resend integration in desktop — emails would surprise
        # users. The notifications/email module still imports it but stays
        # in stub mode (STUB_RESEND defaults on in desktop).
    ],
    noarchive=False,
)

# Strip useless data to keep binary small.
a.datas = [d for d in a.datas if not d[0].startswith('matplotlib')]

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='appname-server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,             # UPX breaks notarization + AV flags
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,          # MUST be True — Tauri reads stdout for token/port
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,  # Tauri does the signing
    entitlements_file=None,
)
