# Phase 10.10 — Desktop validation checklist

Run this checklist on **all three OSes** before tagging `v0.1.0` and
shipping. Each row should be checked + dated by the person who tested.

| # | Test | macOS 14+ | Windows 11 | Ubuntu 22.04 |
|---|------|:---------:|:----------:|:-----------:|
| 1 | Installer runs without security warnings (signed builds) | ☐ | ☐ | ☐ |
| 2 | First-launch onboarding: Settings → API keys card visible | ☐ | ☐ | ☐ |
| 3 | Paste invalid Anthropic key → "Validate" returns error | ☐ | ☐ | ☐ |
| 4 | Paste valid Anthropic key → "Validate" returns ok=true | ☐ | ☐ | ☐ |
| 5 | "Fetch jobs now" populates feed (>0 rows) within 30s | ☐ | ☐ | ☐ |
| 6 | Resume upload + parse completes (Sonnet call) | ☐ | ☐ | ☐ |
| 7 | Tailor a job → ATS score > 0 + PDF download works | ☐ | ☐ | ☐ |
| 8 | Application moves through tracker stages (saved → applied → phone) | ☐ | ☐ | ☐ |
| 9 | Cover letter generation works | ☐ | ☐ | ☐ |
| 10 | Interview prep generation works | ☐ | ☐ | ☐ |
| 11 | Analytics dashboard loads (no 402 — desktop has no quota) | ☐ | ☐ | ☐ |
| 12 | Close window → app hides to tray (doesn't quit) | ☐ | ☐ | ☐ |
| 13 | Tray click toggles window visibility | ☐ | ☐ | ☐ |
| 14 | Quit from tray → sidecar process killed (no zombie) | ☐ | ☐ | ☐ |
| 15 | Restart app → all data persists (resume, applications, jobs) | ☐ | ☐ | ☐ |
| 16 | Disconnect internet → tracker still works (read-only data) | ☐ | ☐ | ☐ |
| 17 | Disconnect internet → tailor surfaces clear "no internet" error | ☐ | ☐ | ☐ |
| 18 | LinkedIn ZIP import works | ☐ | ☐ | ☐ |
| 19 | GitHub profile import works (with token) | ☐ | ☐ | ☐ |
| 20 | Auto-updater detects v0.1.1 (after publishing test build) | ☐ | ☐ | ☐ |
| 21 | Tampered binary → updater rejects signature | ☐ | ☐ | ☐ |
| 22 | About dialog shows version + 3 attributions | ☐ | ☐ | ☐ |
| 23 | Sidecar log at `~/.appname/logs/sidecar.log` is populated | ☐ | ☐ | ☐ |

## Regression tests (run on dev machine, not packaged build)

| # | Test | Pass |
|---|------|:----:|
| R1 | `APPNAME_MODE=saas pytest backend/tests/` — all green | ☐ |
| R2 | `npm run typecheck` in `web/` — clean | ☐ |
| R3 | `npx tsc --noEmit` in `mobile/` — clean | ☐ |
| R4 | SaaS Render deploy still serves /api/jobs without errors | ☐ |
| R5 | SaaS web build + deploy still works (vercel build succeeds) | ☐ |

## Pre-flight before tagging release

- [ ] `desktop/src-tauri/icons/icon.icns` and `icon.ico` are real (not the
      placeholder PNGs from initial scaffold).
- [ ] `tauri.conf.json` `plugins.updater.pubkey` replaced with the real
      ed25519 public key.
- [ ] GitHub repo secrets set: `TAURI_SIGNING_PRIVATE_KEY`,
      `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `APPLE_*`, `WINDOWS_*`.
- [ ] `desktop.appname.io` Vercel project up + DNS pointing at it.
- [ ] CHANGELOG.md updated with v0.1.0 release notes.
- [ ] Landing page download links point at the latest GitHub Release.
- [ ] Tested update flow end-to-end: install v0.0.9 → publish v0.1.0 →
      app prompts for update → user accepts → relaunch into v0.1.0.

## How to run regression test R4

```bash
# From repo root
APPNAME_MODE=saas \
APPNAME_DISABLE_SCHEDULER=1 \
STUB_JOBS_API=1 STUB_ANTHROPIC=1 STUB_RESEND=1 STUB_EXPO_PUSH=1 \
pytest backend/tests/ -q
```

If all 162 tests pass in SaaS mode, the storage-adapter pattern is intact
and the desktop additions haven't leaked into the SaaS code path.

## Sign-off

When all rows in both tables are checked:

```
git tag v0.1.0
git push origin v0.1.0
```

The `desktop-release.yml` workflow will pick up the tag and build all 3
platforms automatically.
