# [AppName] Mobile — App Store submission guide

The mobile project is configured and ready to build. **Anthropic and the dev
agents do NOT submit on your behalf** — you run the EAS commands yourself with
your own paid developer accounts.

## What's already done

- `app.json` configured with bundle ID `com.appname.app`, version `1.0.0`, and
  pointers to icon / splash assets at `./assets/`
- `eas.json` has three build profiles (`development`, `preview`, `production`)
  and a `submit.production` block with iOS App Store + Google Play
- Placeholder icons generated at `./assets/{icon,adaptive-icon,favicon,splash}.png`
  — replace with final brand assets before submitting
- iOS `infoPlist.ITSAppUsesNonExemptEncryption: false` is set so you skip the
  export-compliance form on every submission
- `runtimeVersion.policy: "appVersion"` + EAS Update URL placeholder so you can
  ship JS-only patches without re-submitting binaries

## One-time setup (before first build)

### 1. Install EAS CLI

```bash
npm install -g eas-cli
eas login
```

### 2. Initialize the EAS project

```bash
cd mobile
eas init
```

This will:
- Prompt to create a new EAS project (say yes)
- Print a `projectId` UUID
- Update `app.json` automatically with the real `extra.eas.projectId` and
  `updates.url` (replacing the `REPLACE_WITH_PROJECT_ID_FROM_eas_init` placeholders)
- Update `app.json` with your Expo username (replacing `REPLACE_WITH_EXPO_USERNAME`)

### 3. Apple Developer Program ($99/year)

Required for iOS submission. Get it at https://developer.apple.com/programs/.

Once enrolled:
1. Go to App Store Connect → My Apps → "+" → New App
2. Bundle ID: `com.appname.app` (must match `app.json` exactly)
3. Note the **App Store Connect App ID** (a long numeric string) and **Team ID**
   (10-character alphanumeric in your account membership page)
4. Edit `eas.json` → replace the three `REPLACE_WITH_...` values under `submit.production.ios`

### 4. Google Play Developer ($25 one-time)

Required for Android submission. Get it at https://play.google.com/console/.

Once enrolled:
1. Create a new app in Google Play Console
2. Package name: `com.appname.app` (must match `app.json` exactly)
3. Set up a service account and download the JSON key:
   - Google Cloud Console → IAM & Admin → Service Accounts → Create
   - Grant role: "Service Account User"
   - Generate JSON key → save as `mobile/play-store-service-account.json`
   - Add `play-store-service-account.json` to `.gitignore` (do not commit!)
4. Link the service account in Play Console → Setup → API access

## Build commands

```bash
cd mobile

# Development build (load via Expo Go / dev client)
eas build --profile development --platform ios
eas build --profile development --platform android

# Production binaries (signed, store-ready)
eas build --profile production --platform ios
eas build --profile production --platform android
```

iOS production builds take ~20 min and produce a `.ipa`. Android takes ~10 min
and produces an `.aab` (App Bundle) ready for Play Store.

## Submission

After production builds finish:

```bash
# iOS — uploads to App Store Connect, then you submit via the web UI
eas submit --profile production --platform ios

# Android — uploads to internal track as a draft
eas submit --profile production --platform android
```

After upload:

**iOS**: Go to App Store Connect → My Apps → [AppName] → fill in:
- Screenshots (6.7" iPhone required, 6.5" iPhone optional but recommended)
- App description, keywords, support URL, marketing URL
- Privacy policy URL (required since v17 — host one before submitting)
- Age rating questionnaire
- Content rights (we own everything, no third-party content)
- App Review Information (Apple's reviewers may need a test login — give them a
  Pro test account so they can see analytics + tailor)
- Then "Submit for Review"

**Android**: Go to Play Console → [AppName] → Internal testing → Create new release
- Promote to Production track when ready
- Fill in store listing, content rating, target audience, app category
- Data safety form (we collect: email, resume content, application history;
  data is encrypted in transit and at rest; not shared with third parties beyond
  the AI providers and email/push services explicitly listed in our privacy policy)

## OTA updates (after first submission)

For JS-only changes (UI tweaks, bug fixes that don't touch native modules), you
can ship without going through review:

```bash
eas update --branch production --message "Fix tracker filter bug"
```

If a change touches native modules (new Expo SDK, new permissions, new plugins),
it needs a new binary build + resubmission. The `runtimeVersion.policy:
"appVersion"` in `app.json` handles the gating: bump `app.json:version` for
binary-required changes, leave it alone for OTA-eligible changes.

## Known gotchas

- **`eas init` must run before any build** — it patches `app.json` with the
  project ID. Without it, builds fail with "Project ID is missing".
- **Push notifications**: Expo handles APNs and FCM automatically once you
  build with EAS — you don't need to manually configure certificates. The
  first build prompts to generate them.
- **Privacy policy URL**: Apple rejects apps that submit without one. Host a
  simple page at `https://[appname].com/privacy` covering the data items in the
  Play Store data-safety section above.
- **iOS test account**: include credentials in App Review Information for any
  feature behind sign-in. Without it, Apple rejects on first review.
- **Android signing**: EAS manages the upload key for you. Do not rotate it
  yourself or you'll lose the ability to update existing installs.

## Reference

- EAS Build docs: https://docs.expo.dev/build/introduction/
- EAS Submit docs: https://docs.expo.dev/submit/introduction/
- App Store review guidelines: https://developer.apple.com/app-store/review/guidelines/
- Play Store policies: https://play.google.com/about/developer-content-policy/
