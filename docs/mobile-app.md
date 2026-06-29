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
| **Resident rent & fees** | Bank (ACH), Link, or card via Stripe | **Bank (ACH) only** via Stripe |

Rent in the app always uses ACH (`src/lib/platform/resident-payments.ts`). Subscription Apple Pay setup: [`docs/stripe-apple-pay-subscriptions.md`](stripe-apple-pay-subscriptions.md).

---

## What's already in the repo

| Path | Purpose |
| --- | --- |
| `capacitor.config.ts` | App id `com.axisseattlehousing.app`, name **Axis**, points the WebView at production. |
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
git-ignored). Then generate app icons and splash screens from the Axis mark:

```bash
# Default sources are committed in resources/ (regenerate the Axis-mark
# defaults anytime: python3 scripts/generate-app-icons.py). Swap in designer
# artwork at resources/icon.png (1024×1024) + resources/splash.png (2732×2732)
# when ready, then copy into assets/ and run:
mkdir -p assets && cp resources/icon.png assets/icon.png && cp resources/splash.png assets/splash.png
npx @capacitor/assets generate --iconBackgroundColor '#ffffff' --splashBackgroundColor '#080b14'
```

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

On iOS add an `NSCameraUsageDescription` (and
`NSPhotoLibraryUsageDescription`) string to `ios/App/App/Info.plist`, e.g.
"Axis uses the camera to attach photos to applications and work orders."

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
