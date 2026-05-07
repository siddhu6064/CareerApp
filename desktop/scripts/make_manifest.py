"""Generate desktop/site/latest.json from env vars.

Called by .github/workflows/desktop-release.yml after building all platform
release assets. Reads signatures and version from environment variables so
there is no shell interpolation inside Python string literals.

Required env vars (all set by the workflow):
  VERSION, PUB_DATE, BASE, SIG_MAC_ARM, SIG_MAC_X64, SIG_LINUX, SIG_WIN
"""
import json
import os
import sys
from pathlib import Path

v    = os.environ["VERSION"]
dt   = os.environ["PUB_DATE"]
base = os.environ["BASE"]

entries = [
    ("darwin-aarch64", os.environ["SIG_MAC_ARM"], f"{base}/AppName_{v}_aarch64.app.tar.gz"),
    ("darwin-x86_64",  os.environ["SIG_MAC_X64"], f"{base}/AppName_{v}_x64.app.tar.gz"),
    ("linux-x86_64",   os.environ["SIG_LINUX"],   f"{base}/appname_{v}_amd64.AppImage.tar.gz"),
    ("windows-x86_64", os.environ["SIG_WIN"],     f"{base}/AppName_{v}_x64-setup.nsis.zip"),
]

# Drop platforms with empty signatures (unsigned / cert-not-yet-configured builds)
signed = {p: {"signature": s, "url": u} for p, s, u in entries if s.strip()}

manifest = {
    "version": v,
    "notes": "See CHANGELOG.md for what's new.",
    "pub_date": dt,
    "platforms": signed,
}

out = Path(__file__).parent.parent / "site" / "latest.json"
out.write_text(json.dumps(manifest, indent=2))

print(f"Manifest written to {out}")
print(f"  version:   {v}")
print(f"  pub_date:  {dt}")
print(f"  platforms: {list(signed.keys()) or ['(none — unsigned build)']}")

if not signed:
    print("WARNING: No signed platforms. Update manifest has empty platforms dict.")
    print("         The auto-updater will not offer an update until certs are configured.")
