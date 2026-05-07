# desktop.appname.io

Static site for the [AppName] desktop variant.  
Hosted on Vercel at `https://desktop.appname.io`.

## Contents

| File | Purpose |
|---|---|
| `index.html` | Download landing page — links to GitHub Release assets |
| `latest.json` | Tauri auto-updater manifest — served to the app on every launch |
| `vercel.json` | Vercel routing config (no-cache headers on `latest.json`) |

## Deploy to Vercel

```bash
cd desktop/site
npx vercel --prod
# Set the custom domain to desktop.appname.io in the Vercel dashboard
```

Or connect the GitHub repo to Vercel — point the root directory to `desktop/site`.  
Every push to `main` that touches this folder auto-redeploys.

## Updating `latest.json` after a release

The `desktop-release.yml` GitHub Actions workflow generates a new `latest.json` and
commits it automatically after a successful multi-platform build. You only need to
update it manually if the workflow fails mid-run.

### Manual update steps

1. Go to the GitHub Release for the new version.
2. Download the `.sig` file next to each binary (e.g. `AppName_0.1.1_aarch64.app.tar.gz.sig`).
3. Fill in `latest.json` with the new version, pub_date, download URLs, and signatures:

```json
{
  "version": "0.1.1",
  "notes": "What changed in this release (pulled from CHANGELOG.md).",
  "pub_date": "2026-06-01T12:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "<contents of AppName_0.1.1_aarch64.app.tar.gz.sig>",
      "url": "https://github.com/siddhu6064/CareerApp/releases/download/v0.1.1/AppName_0.1.1_aarch64.app.tar.gz"
    },
    "darwin-x86_64": {
      "signature": "<contents of AppName_0.1.1_x64.app.tar.gz.sig>",
      "url": "https://github.com/siddhu6064/CareerApp/releases/download/v0.1.1/AppName_0.1.1_x64.app.tar.gz"
    },
    "linux-x86_64": {
      "signature": "<contents of appname_0.1.1_amd64.AppImage.tar.gz.sig>",
      "url": "https://github.com/siddhu6064/CareerApp/releases/download/v0.1.1/appname_0.1.1_amd64.AppImage.tar.gz"
    },
    "windows-x86_64": {
      "signature": "<contents of AppName_0.1.1_x64-setup.nsis.zip.sig>",
      "url": "https://github.com/siddhu6064/CareerApp/releases/download/v0.1.1/AppName_0.1.1_x64-setup.nsis.zip"
    }
  }
}
```

4. Commit and push — Vercel redeploys automatically.
5. Running app instances poll this endpoint on next launch and show the in-app update dialog.

## Signature files

Tauri generates `.sig` files alongside each binary during `cargo tauri build`.
They are ed25519 signatures of the `.tar.gz`/`.zip` archive, encoded as base64.
The public key is embedded in the app binary via `tauri.conf.json`
(`plugins.updater.pubkey`).

**Never commit the private key.** It lives in GitHub Actions secret
`TAURI_SIGNING_PRIVATE_KEY`.
