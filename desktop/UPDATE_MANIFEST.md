# Auto-update manifest

Phase 10.8 — Tauri's auto-updater fetches a JSON manifest from
`https://desktop.appname.io/updates.json` (the URL configured under
`plugins.updater.endpoints` in `tauri.conf.json`). The manifest tells the
app whether a newer signed build is available, and where to download it.

## Schema (Tauri v2)

```json
{
  "version": "0.1.1",
  "notes": "Bug fixes and tailoring speed improvements.",
  "pub_date": "2026-06-01T12:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "<base64-ed25519-signature-of-tarball>",
      "url": "https://github.com/siddhu6064/CareerApp/releases/download/v0.1.1/AppName_0.1.1_aarch64.app.tar.gz"
    },
    "darwin-x86_64": {
      "signature": "...",
      "url": "https://github.com/siddhu6064/CareerApp/releases/download/v0.1.1/AppName_0.1.1_x64.app.tar.gz"
    },
    "linux-x86_64": {
      "signature": "...",
      "url": "https://github.com/siddhu6064/CareerApp/releases/download/v0.1.1/appname_0.1.1_amd64.AppImage.tar.gz"
    },
    "windows-x86_64": {
      "signature": "...",
      "url": "https://github.com/siddhu6064/CareerApp/releases/download/v0.1.1/AppName_0.1.1_x64-setup.nsis.zip"
    }
  }
}
```

## How to host

The cheapest path is a static Vercel project under `desktop.appname.io`.

1. Create a tiny project that just serves the JSON file.
2. After each `desktop-release.yml` run, replace the JSON's contents with
   the new version + signed-asset URLs from the GitHub Release.
3. The app polls this endpoint roughly once per launch (Tauri default).

## Generating the ed25519 signing keypair

```bash
cargo install tauri-cli --version "^2.0.0"
cargo tauri signer generate -w ~/.tauri/appname.key
```

This produces:
- `~/.tauri/appname.key`     — keep secret. Add as GitHub Actions secret
  `TAURI_SIGNING_PRIVATE_KEY` (base64-encoded).
- `~/.tauri/appname.key.pub` — public key. Replace the
  `REPLACE_WITH_TAURI_UPDATER_PUBKEY` placeholder in
  `desktop/src-tauri/tauri.conf.json` with this value.

After updating the public key, the **first** signed release that ships with
the new pubkey is the only one users on previous unsigned builds can take.
Subsequent updates verify against the embedded pubkey automatically.

## Rotation policy

If the private key leaks: ship a new app version with a rotated pubkey,
publish it as a non-updater release (users have to reinstall manually), then
resume the auto-updater chain from there. The old key never accepts
signatures from your real builds again.
