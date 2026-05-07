#!/usr/bin/env bash
# Phase 10.5 — build the FastAPI sidecar and rename for Tauri convention.
#
# Run from repo root:
#     ./desktop/scripts/build_sidecar.sh
#
# Tauri sidecar binaries must be named <name>-<host-triple>(.exe) and live in
# desktop/src-tauri/binaries/. This script invokes PyInstaller, then copies
# the output to the right location with the right name.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

# Detect target triple
HOST_TRIPLE="$(rustc -vV | sed -n 's/^host: //p')"
echo "Building sidecar for host triple: $HOST_TRIPLE"

# Build with PyInstaller. The spec lives in backend/.
(
  cd backend
  pyinstaller appname-server.spec --clean --noconfirm
)

# Tauri convention
DEST="desktop/src-tauri/binaries"
mkdir -p "$DEST"

EXT=""
if [[ "$HOST_TRIPLE" == *"windows"* ]]; then
  EXT=".exe"
fi

SRC="backend/dist/appname-server${EXT}"
DST="$DEST/appname-server-${HOST_TRIPLE}${EXT}"

cp -v "$SRC" "$DST"
chmod +x "$DST"

echo "✓ Sidecar built: $DST"
echo "Next: cd desktop/src-tauri && cargo tauri build"
