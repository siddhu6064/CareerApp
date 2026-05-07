# AppName Desktop

Free desktop job-search app. Same backend as the SaaS, but runs entirely on
your machine. Bring your own Anthropic API key.

## What this is

- **No subscription.** You pay Anthropic ~$0.05 per resume tailor; nothing to us.
- **Same features as Pro.** Cover letters, interview prep, analytics, ATS scoring.
- **Your data stays local.** Everything in `~/.appname/data.db`. No telemetry.
- **Free job sources.** Pulls from public Greenhouse / Lever / Ashby / Workable boards (no JSearch RapidAPI fees).

## Install

Download the latest installer for your OS from
[GitHub Releases](https://github.com/siddhu6064/CareerApp/releases):

- **macOS** — `AppName_*.dmg` (Apple Silicon) or `AppName_*_x64.dmg` (Intel)
- **Windows** — `AppName_*_x64-setup.exe`
- **Linux** — `appname_*_amd64.AppImage` (chmod +x then run)

> First-time-launch warnings: if you don't see the app menu bar after install,
> macOS may have quarantined it. Run `xattr -cr /Applications/AppName.app`
> once, then relaunch.

## First launch

1. The app opens with an **API keys** card under **Settings**.
2. Paste your Anthropic key (get one at
   [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)).
   Keys are stored in your local SQLite DB, never sent anywhere except Anthropic.
3. (Optional) Paste a GitHub PAT for the GitHub-profile importer.
4. Click **Validate keys** — this pings Anthropic with a 1-token request
   (~$0.0001) to confirm the key works.
5. Hit **Fetch jobs now** to do an initial pull from the default boards.
6. Upload your master resume on the **Resume** tab.
7. Open a job, click **Tailor** — your first AI-tailored resume in ~5 seconds.

## Job sources

By default the app pulls from these public ATS boards (no auth needed):

- **Greenhouse**: openai, anthropic, stripe, airtable, vercel, scale, notion, linear, discord, figma
- **Lever**: netflix, robinhood, shopify, twitch
- **Ashby**: ramp, linear

To customize, open `~/.appname/data.db` with any SQLite tool and edit the
`settings` table:

```sql
UPDATE settings SET value = 'openai,anthropic,my-target-co' WHERE key = 'sources.greenhouse';
```

Or via the API while the app is running:

```bash
curl -X PUT http://127.0.0.1:<port>/api/settings/sources/greenhouse \
  -H "Authorization: Bearer $(cat ~/.appname/api_token)" \
  -d '{"slugs": ["openai", "anthropic", "stripe"]}'
```

A daily fetch runs automatically at 6:00 your local time.

## Cost expectations

| Action                | Cost (approx) |
|----------------------|---------------|
| Resume parse (1×)    | $0.10 (Sonnet) |
| Tailor (1×)          | $0.05 (Sonnet) |
| Cover letter (1×)    | $0.03 (Sonnet) |
| Interview prep (1×)  | $0.04 (Sonnet) |
| Daily fetch tagging  | $0.01–0.10/day (Haiku) |

Heavy use ≈ $5–15/month at Anthropic. Set a usage cap in your
[Anthropic billing settings](https://console.anthropic.com/settings/billing)
if you want a hard limit.

## Building from source

Prerequisites: Node 20+, Python 3.12+, Rust stable, Tauri 2 system deps
([install guide](https://tauri.app/start/prerequisites/)).

```bash
git clone https://github.com/siddhu6064/CareerApp.git
cd CareerApp

# Backend deps
pip install -r backend/requirements.txt
pip install pyinstaller==6.10.0

# Web deps
cd web && npm ci --legacy-peer-deps && cd ..

# Build sidecar (PyInstaller binary)
./desktop/scripts/build_sidecar.sh

# Build Tauri app (this also builds the static web export)
cd desktop/src-tauri && cargo tauri build
```

Output lands in `desktop/src-tauri/target/release/bundle/`.

## Troubleshooting

**App won't open / "AppName quit unexpectedly"** — Check sidecar logs at
`~/.appname/logs/sidecar.log`. The most common cause is an Anthropic key
that hasn't been pasted yet (the app needs one to do anything useful).

**"Failed to validate Anthropic key"** — Confirm the key works:
```bash
curl -X POST https://api.anthropic.com/v1/messages \
  -H "x-api-key: <YOUR_KEY>" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-haiku-4-5","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}'
```

**No jobs in feed** — Source slugs may be misconfigured or the boards may
have no open roles right now. Check **Settings → Validate keys** to confirm
the app is reaching the internet, then click **Fetch jobs now**.

**"This app is damaged" on macOS** — Quarantine attribute. Run
`xattr -cr /Applications/AppName.app` and relaunch.

## Privacy

- Your resume, applications, and analytics never leave your machine.
- The only outbound calls are: Anthropic (for AI), GitHub API (if you set
  a token), and the configured ATS boards (Greenhouse / Lever / Ashby /
  Workable).
- The auto-updater pings `desktop.appname.io/updates.json` once on launch
  to check for a new version.

## Reporting issues

[github.com/siddhu6064/CareerApp/issues](https://github.com/siddhu6064/CareerApp/issues)

Include:
- Your OS + version
- The version reported in **About → AppName**
- Sidecar log excerpt from `~/.appname/logs/sidecar.log`

## License

AppName is dual-licensed. The desktop variant is free under the MIT-derived
terms covering the open-source portions; the SaaS-only modules (billing,
multi-tenant orchestration, white-label PDF backend) remain proprietary.

Third-party attributions: see [`LICENSES/ATTRIBUTIONS.md`](./LICENSES/ATTRIBUTIONS.md).
