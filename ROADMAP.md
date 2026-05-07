# Roadmap

Current build state: **75% complete (189/252 tasks)** — see
[Build Checklist](AppName_BuildChecklist_v5_4.html) for the full breakdown.

## Now — Phase 7 (Billing)

LemonSqueezy integration to convert Free users to paying Pro/Coach subscribers.

- LemonSqueezy account + product setup (Pro $19/mo, Coach $49/mo)
- `POST /api/billing/checkout` — create checkout session
- `POST /api/billing/portal` — customer portal for manage/cancel
- `POST /api/webhooks/lemonsqueezy` — subscription lifecycle (created/updated/cancelled)
- HMAC webhook signature verification
- Upgrade modal triggered at all tier gates (tailor limit, analytics, cover letters)
- Pricing page (`/billing`) with three-tier comparison
- Billing settings section (current plan, renewal date, manage link)
- Plan badge in nav/header
- In-app mobile upgrade sheet

## Next — Remaining Phase 8

App Store submission (user action after billing is live):

- Apple Developer Program enrollment ($99/yr)
- Google Play Console account ($25 one-time)
- `eas build --platform all --profile production`
- `eas submit --platform ios` + `eas submit --platform android`

## Phase 6 deploy unblocks

Once the Supabase project is provisioned and DNS is configured:

- Set `RESEND_API_KEY` + configure `digest@appname.io` domain (SPF/DKIM/DMARC)
- `SUPABASE_URL` + `SUPABASE_ANON_KEY` + `SUPABASE_JWT_SECRET` → SaaS auth live
- `SUPABASE_SERVICE_KEY` → SupabaseAdapter fully implemented
- Confirm Supabase Realtime fires on application PATCH

## Desktop v0.1.0 release

Pending user actions before first desktop release:

- Enroll Apple Developer Program ($99/yr) for macOS notarization
- Acquire Windows EV code signing cert (~$300/yr) for SmartScreen bypass
- Run multi-OS validation (Win11 / macOS 14+ / Ubuntu 22.04 VMs)
- Generate ed25519 updater keypair (`cargo tauri signer generate`)
- Set `TAURI_SIGNING_PRIVATE_KEY` in GitHub Actions secrets
- Tag `v0.1.0` — triggers `desktop-release.yml` matrix build
- Deploy `desktop/site/` to Vercel as `desktop.appname.io`

## Post-launch ideas (not scoped)

These are ideas for consideration after the initial release — none are
committed and none are in the current codebase.

- **LinkedIn auto-apply integration** — one-click apply from the job detail page
- **Resume version comparison** — A/B test two tailored versions and track which
  gets more responses
- **Multi-resume support** — maintain different master resumes for different roles
  (e.g. engineering vs. product)
- **Slack / Teams digest** — send the daily digest to a Slack workspace instead
  of (or in addition to) email
- **Job board scraping improvements** — more ATS boards for the desktop source
  adapters (Ashby, Rippling, Greenhouse Enterprise)
- **Team plan** — shared talent pipeline for small teams; coach tier evolved into
  a multi-seat plan
- **AI mock interviews** — voice-based practice using the prep questions already
  generated, with Claude Sonnet feedback
