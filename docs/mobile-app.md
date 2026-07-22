# Axis native apps (iOS + Android)

Axis ships to the App Store and Google Play as a **Capacitor** native shell that
loads the live, server-rendered site (`https://www.axis-seattle-housing.com`).
The app reuses 100% of the web app — auth, Stripe, the manager/resident/admin
portals — and adds real native capabilities (push notifications, camera) on top.

- **Web/UI changes ship instantly** via your normal Vercel deploy. No app-store
  review needed for content or UI — the WebView always loads the latest site.
- **Native-shell changes** (new plugins, icons, permissions, the Capacitor
  version) require rebuilding and resubmitting the app.

**Web + native parity:** see [`docs/web-and-native-parity.md`](web-and-native-parity.md)
for the checklist and registries that keep browser and app behavior aligned.

---

## Payments (web vs native app)

| Flow | Web | iOS / Android app |
| --- | --- | --- |
| **Manager subscription** (Pro / Business) | Stripe Checkout — card or Apple Pay | Same — choose **Apple Pay** or card in embedded checkout |
| **Resident rent & fees** | Bank (ACH), card (**Apple Pay / Google Pay** or a typed card), or Link via Stripe | Bank (ACH) or card via Stripe — **no Link**, and the Apple Pay / Google Pay hint is hidden |

Per-surface pay methods come from `residentPaymentMethodsForSurface()` (`src/lib/platform/resident-payments.ts`); the app drops Link. The card option advertises the wallets on the web only — Apple Pay inside the WebView depends on native entitlement, which is out of scope for the payments work. Apple Pay setup: [`docs/stripe-apple-pay-payments.md`](stripe-apple-pay-payments.md) (rent + application fees), [`docs/stripe-apple-pay-subscriptions.md`](stripe-apple-pay-subscriptions.md) (subscriptions).

---

## What's already in the repo

| Path | Purpose |
| --- | --- |
| `capacitor.config.ts` | App id `com.axisseattlehousing.app`, name **PropLane**, points the WebView at production. |
| `native-shell/index.html` | Branded "you're offline" fallback (Capacitor's required `webDir`). |
| `src/components/native/native-bridge.tsx` | Mounted in the root layout. On native only: hides splash, styles the status bar, registers push, opens deep links. No-ops on the web. |
| `src/app/api/native/register-push-token/route.ts` | Stores a device token for the signed-in user. |
| `supabase/migrations/20260628120000_device_push_tokens.sql` | `device_push_tokens` table. |
| `src/lib/push-notifications.server.ts` | `sendPushToUser()` — delivers via Firebase Cloud Messaging. No-ops until `FCM_*` env is set. |
| `src/lib/native/use-native-camera.ts` | `useNativeCamera()` — native camera/library picker, web file-input fallback. |

Apply the migration with your normal flow (e.g. `npm run db:apply-sql`) before
testing push.

---

## Local development (simulator — mobile UI)

Unreleased mobile UI (`/auth/welcome`, native chrome, bottom tabs) only appears
when the WebView loads a server that has that code — usually **your local dev
server**, not production.

```bash
npm run dev              # terminal 1 — keep running
npm run cap:dev          # auto-detects Mac LAN IP for physical iPhone (simulator works too)
npm run cap:ios          # open Xcode, then Run (⌘R)
```

**In Xcode, pick a simulator** (e.g. iPhone 16) — **not** “Any iOS Device
(arm64)”. Simulator builds do not need provisioning profiles.

`npm run cap:dev` writes your Mac's LAN IP into the iOS project (e.g.
`http://192.168.1.50:3000/auth/welcome`). **Physical iPhones cannot use
`localhost`** — phone and Mac must be on the same Wi‑Fi, and `npm run dev` must
be running. Override with `CAP_SERVER_URL` if needed:

```bash
CAP_SERVER_URL=http://192.168.1.50:3000 npm run cap:sync
```

**TestFlight / App Store builds** use production (`npm run cap:prod`). The app opens
`/auth/sign-in`, which shows the native welcome role picker (Resident / Manager).

---

## Prerequisites (install once, on this Mac)

1. **Xcode** (full app, from the Mac App Store — ~7 GB). Then point the command
   line at it and accept the license:
   ```bash
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   sudo xcodebuild -license accept
   ```
2. **CocoaPods**: `brew install cocoapods`
3. **Android Studio** (https://developer.android.com/studio). On first launch it
   installs the Android SDK. Then add to your shell profile:
   ```bash
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export PATH="$PATH:$ANDROID_HOME/platform-tools"
   ```
   (Java 21 is already installed and is fine for the Android build.)

---

## One-time: create the native projects

From the repo root, after the prerequisites are installed:

```bash
npx cap add ios
npx cap add android
```

This scaffolds `ios/` and `android/` (committed to git; build artifacts are
git-ignored). The **iOS** app icon and splash screen are generated from the
**PropLane** paper-plane mark:

```bash
# Regenerate the PropLane iOS defaults anytime (sharp is a devDependency):
node scripts/generate-ios-brand-assets.mjs
```

That script is the source of truth. It reproduces the web brand mark
(`src/components/brand/axis-logo.tsx` — plane body + fold line) in the PropLane
steel/blue palette (`src/app/globals.css`) and writes, in one pass:

- `resources/icon.png` (1024×1024) + `resources/splash.png` (2732×2732) — the
  `@capacitor/assets` sources.
- `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` — the
  shipped iOS marketing icon (full-bleed steel/blue gradient + white plane).
- `ios/App/App/Assets.xcassets/Splash.imageset/` — the launch image referenced
  by `Base.lproj/LaunchScreen.storyboard` (dark `#080b14` bg + centered brand
  tile + white plane).

Every PNG it writes is **opaque RGB with no alpha channel** — App Store Connect
rejects a marketing icon that carries one (ITMS-90717 "Invalid App Store
Icon"), and a simulator build will not catch it. The script asserts this after
each write, so keep any new output going through its `png()` helper.

To swap in designer artwork instead, replace `resources/icon.png` +
`resources/splash.png` and fan them out to every derived size:

```bash
# @capacitor/assets prefers ./assets and only falls back to ./resources when
# assets/ is absent. The repo's tracked Assets/ dir (capital A — lease notes)
# matches that probe on case-insensitive macOS/Windows filesystems, so name
# resources/ explicitly rather than relying on the fallback.
npx @capacitor/assets generate \
  --assetPath resources \
  --splashBackgroundColor '#080b14'
```

**Android still ships the legacy "AX" lettermark.** The generator above is iOS
only; `android/app/src/main/res/mipmap-*/ic_launcher.png` and the
`drawable-*/splash.png` variants are untouched Capacitor scaffolding and are
tracked as a separate follow-up. Every non-Android user-visible surface should
read PropLane.

---

## Day-to-day workflow

```bash
npm run cap:sync     # after plugin / native config changes
npm run cap:ios      # Xcode → Run on a simulator
npm run cap:android  # Android Studio → Run
```

See **Local development (simulator — mobile UI)** above for unreleased branch
testing. Production WebView changes ship via Vercel deploy — no app rebuild.

---

## Troubleshooting Xcode builds

### “Build Failed” with destination **Any iOS Device (arm64)**

That target is for **physical devices / App Store archives**. It requires a
**Development Team** and provisioning profile. The repo sets team
`8FH3GVHCZ9` in `ios/App/App.xcodeproj/project.pbxproj`.

**For daily UI work:** switch the run destination to an **iPhone Simulator**
(e.g. iPhone 16 Pro). Simulator builds use “Sign to Run Locally” and skip
provisioning.

### “Signing requires a development team” / Personal Team warnings

1. **Xcode → Settings → Accounts** — sign in with your paid Apple Developer ID.
2. **App target → Signing & Capabilities** — Team = **Prakrit Ramachandran**
   (paid, `8FH3GVHCZ9`), **not** “(Personal Team)”.
3. Keep **Automatically manage signing** enabled → **Try Again**.

`npx cap sync` can strip `DEVELOPMENT_TEAM` from `project.pbxproj`. If signing
breaks after sync, restore the team in Xcode or re-commit the pbxproj lines.

### Emulator shows the **website** (navbar, “Portal sign-in”) instead of mobile UI

The WebView loads whatever URL is in `ios/App/App/capacitor.config.json`:

| `server.url` | What you see |
| --- | --- |
| `https://www.axis-seattle-housing.com/...` | Production website (old UI until deployed) |
| `http://127.0.0.1:3000/auth/welcome` | Local mobile welcome (Resident / Manager) |

Run `npm run cap:dev` with `npm run dev` running, then rebuild in Xcode.

### Xcode Cloud: “branch is not associated with the workflow”

**Product → Xcode Cloud → Manage Workflows** → edit start conditions → add
`feat/mobile-app-shell` (or `feat/*`). Xcode Cloud builds the native shell only;
it does not run your local `npm run dev`.

### Xcode Cloud: “package at node_modules/@capacitor/… doesn’t exist in file system”

`ios/App/CapApp-SPM/Package.swift` pulls every Capacitor plugin from
`node_modules` by relative path (`../../../node_modules/@capacitor/app`, …). A
fresh Xcode Cloud clone has **no `node_modules`** — Xcode Cloud runs `xcodebuild`
directly and nothing runs `npm ci` — so SPM can’t resolve any of those packages
and the build dies with:

```
Could not resolve package dependencies: the package at
'/Volumes/workspace/repository/node_modules/@capacitor/push-notifications'
cannot be accessed (doesn't exist in file system)
```

The fix is **[`ci_scripts/ci_post_clone.sh`](../ci_scripts/ci_post_clone.sh)** at
the repo root. Xcode Cloud runs it automatically after clone (by exact
name/location; it must stay executable, committed with the exec bit) **before**
package resolution. It:

1. Installs **Node 22** via Homebrew — Xcode Cloud runners ship no Node, and
   `package.json` `engines` require 22.x (`brew install node@22`, PATH-added
   since versioned formulae are keg-only).
2. Runs **`npm ci`** (lockfile-exact, never `npm install`).
3. Runs **`npx cap sync ios`** at the **production** `CAP_SERVER_URL` — Xcode
   Cloud builds Release, whose WebView must load the live site (same as
   `npm run cap:prod`).
4. Runs `scripts/verify-cap-prod-config.sh` (as `CONFIGURATION=Release`) to
   prove the baked `capacitor.config.json` points at the production origin —
   the same guard the GitHub workflow runs.
5. **Verifies** all seven SPM-referenced packages landed in `node_modules` and
   **fails loudly** otherwise — a silent partial install reproduces the exact
   error above, just later and more opaquely inside `xcodebuild`.

This mirrors the `npm ci` + `npx cap sync ios` steps in
[`.github/workflows/ios-testflight.yml`](../.github/workflows/ios-testflight.yml)
so the Xcode Cloud and GitHub pipelines build the same thing. The script writes
only `node_modules` and the Capacitor-generated iOS config; it never commits into
`ios/App/Pods` or other generated output.

### “‘apple-sign-in’ depends on ‘capacitor-swift-pm’ 7.0.0..&lt;8.0.0”

Once `node_modules` exists, SPM hits a second conflict: the latest release of
`@capacitor-community/apple-sign-in` (7.1.0 — there is no Capacitor 8 build)
hard-pins `capacitor-swift-pm` to 7.x in its own `Package.swift`, while
`ios/App/CapApp-SPM/Package.swift` pins `exact: "8.4.1"` for the Capacitor 8
core plugins. `xcodebuild -resolvePackageDependencies` cannot satisfy both.

The fix is **[`patches/@capacitor-community+apple-sign-in+7.1.0.patch`](../patches/@capacitor-community+apple-sign-in+7.1.0.patch)**,
which widens that one dependency range to `"7.0.0"..<"9.0.0"`. The root
`postinstall` script runs `patch-package`, so **every `npm ci` re-applies it** —
Xcode Cloud (`ci_post_clone.sh`) and GitHub Actions included — and a fresh clone
is never left with the unpatched plugin. The plugin's Swift source only uses
stable `CAPPlugin` / `CAPBridgedPlugin` APIs that exist in capacitor-swift-pm 8,
so widening the range is compile-safe.

Do **not** hand-edit `ios/App/CapApp-SPM/Package.swift` to work around this — it
is Capacitor-managed and `npx cap sync ios` regenerates it. Dropping the plugin
is also not an option: native Sign in with Apple uses it
(`src/lib/auth/native-apple-sign-in.ts`, see
[`docs/apple-sign-in-setup.md`](apple-sign-in-setup.md)). When the plugin
publishes a Capacitor 8 release, upgrade and delete the patch; bumping it to any
other 7.x means regenerating the patch under the new version-stamped filename.

---

## Push notifications

Both platforms are delivered through **Firebase Cloud Messaging (FCM)** — one
send path. Firebase relays to Apple devices via an APNs key you upload.

### 1. Firebase project
1. Create a project at https://console.firebase.google.com.
2. **Add an Android app** with package `com.axisseattlehousing.app`. Download
   `google-services.json` → place in `android/app/`.
3. **Add an iOS app** with bundle id `com.axisseattlehousing.app`. Download
   `GoogleService-Info.plist` → add to `ios/App/App/` (drag into Xcode).
4. **Project settings → Cloud Messaging → Apple app config**: upload your **APNs
   Auth Key** (`.p8` from the Apple Developer portal → Keys → enable APNs).
5. **Project settings → Service accounts → Generate new private key**. From that
   JSON, set in your server env (Vercel + `.env.local`):
   ```
   FCM_PROJECT_ID=<project_id>
   FCM_CLIENT_EMAIL=<client_email>
   FCM_PRIVATE_KEY=<private_key with \n escapes>
   ```

### 2. Native capabilities
- **iOS (Xcode → Signing & Capabilities):** add **Push Notifications** and
  **Background Modes → Remote notifications**.
- **Android:** the `@capacitor/push-notifications` + `google-services.json` setup
  is handled by `npx cap sync`; no manual manifest edits needed for basic push.

### 3. Sending a push
`sendPushToUser()` is ready to call from any server code (cron jobs, API routes,
the existing notification modules):

```ts
import { sendPushToUser } from "@/lib/push-notifications.server";

await sendPushToUser(residentUserId, {
  title: "Rent due soon",
  body: "Your July rent is due in 3 days.",
  url: "/resident/payments", // opened when the notification is tapped
});
```

It looks up the user's active tokens, sends via FCM, and prunes dead tokens.
Until `FCM_*` is set it returns `{ sent: 0, skipped: true }` and changes nothing.

**Step-by-step Firebase setup:** see [`docs/firebase-push-setup.md`](firebase-push-setup.md).

### Google sign-in (native app)

Google OAuth opens in the **system in-app browser** (not the main WebView). After you pick an
account, Supabase must redirect back into the Axis app — not the marketing homepage.

**1. Supabase redirect URLs** (Authentication → URL configuration → Redirect URLs). **Required:**

```
https://www.axis-seattle-housing.com/auth/callback
https://www.axis-seattle-housing.com/auth/callback/partner-pricing
https://www.axis-seattle-housing.com/auth/callback/resident-signup
```

The native app uses these HTTPS callbacks (same as web). A small bridge page bounces back into the app via the custom URL scheme registered in Xcode/Android.

**Optional** (direct scheme return without the bridge page):

```
com.axisseattlehousing.app://auth/callback
com.axisseattlehousing.app://auth/callback/**
```

If the HTTPS callback is missing, Supabase falls back to the **Site URL** and Google sign-in opens the marketing homepage in the system browser instead of the portal.

**2. Universal / app links (https fallback)** — committed in `public/.well-known/`:

- `apple-app-site-association` — iOS opens `/auth/callback` in the app WebView
- `assetlinks.json` — Android; replace `REPLACE_WITH_RELEASE_KEYSTORE_SHA256` with your
  signing cert fingerprint (`keytool -list -v -keystore …`)

Deploy the site (Vercel) so those files are live, then `npx cap sync` and rebuild the native
app (Associated Domains entitlement is in `ios/App/App/App.entitlements`).

**3. Verify** — `GET /api/auth/oauth-providers` returns `nativeCallbackUrls` and
`nativeRedirectHint` for your environment.

**Suggested wiring** (alongside the existing SMS sends — push complements, not
replaces, Twilio): the rent/move-in reminder crons in
`src/app/api/cron/*` and the resident/manager notification modules in
`src/lib/*-notification*.ts`. Add a `sendPushToUser(...)` call wherever you
already resolve a recipient's user id.

### 4. Camera (native value-add)
Wire `useNativeCamera()` into document / property-condition photo uploads:

```tsx
const { capture } = useNativeCamera();
const shot = await capture();      // native picker in-app, file input on web
if (shot) await upload(shot.file); // shot.previewUrl for an <img> preview
```

The iOS permission prompts (`NSCameraUsageDescription`,
`NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription`) are
already committed in `ios/App/App/Info.plist` — edit them there. They are
user-visible at the permission prompt, so they must read **PropLane**.

---

## Shipping to the stores

### Accounts
- **Apple Developer Program** — $99/yr (https://developer.apple.com/programs/).
  Enrollment can take a day or two; start it early.
- **Google Play Console** — one-time $25 (https://play.google.com/console).

### iOS
1. In Xcode, set the team and a unique bundle id (`com.axisseattlehousing.app`).
2. Product → Archive → distribute to **App Store Connect**.
3. In App Store Connect: create the app, add screenshots, description, privacy
   details (declare camera + push usage), then submit for review.

### Android
1. In Android Studio: Build → Generate Signed Bundle (**.aab**); create/keep a
   keystore safe (losing it blocks future updates).
2. In Play Console: create the app, complete the Data Safety form, upload the
   `.aab`, add a store listing, roll out to internal testing → production.

### Avoiding the "it's just a website" rejection (Apple Guideline 4.2)
This app already includes genuine native features — **push notifications** and
**camera capture** — which clears the bar. To be safe at review:
- Make sure the camera flow and push opt-in are reachable in the build you
  submit.
- Provide a demo reviewer account (resident + manager) in App Store Connect.
- Rent payments via Stripe are fine — they're real-world services, exempt from
  Apple's in-app-purchase requirement (which applies only to digital goods).

---

## Updating the app later
- **Website / portal changes:** just deploy to Vercel. The apps pick it up on
  next launch. No resubmission.
- **Native changes** (Capacitor/plugins/icons/permissions): `npx cap sync`,
  bump the version in Xcode/Android Studio, rebuild, resubmit.
