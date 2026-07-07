# Sign in with Apple (native iOS + web)

Axis uses **Capacitor** (not Expo). Native iOS sign-in exchanges an Apple `identityToken` with Supabase via `signInWithIdToken`; Safari/web still uses Supabase OAuth redirect.

## Step 1 — Supabase Auth → Apple provider

| Field | Value |
|-------|--------|
| **Enable** | ON |
| **Client IDs** | `com.axisseattlehousing.app` only (your iOS bundle ID — **not** an APNs Key ID like `9872GVCALV`) |
| **Secret Key (for OAuth)** | Leave **blank** for native iOS. Web Apple OAuth needs a rotating secret; native does not. |
| **Callback URL** | Already set: `https://<project-ref>.supabase.co/auth/v1/callback` |

Bundle ID source: `capacitor.config.ts` → `appId`, and `ios/App/App.xcodeproj` → `PRODUCT_BUNDLE_IDENTIFIER`.

## Step 2 — Apple Developer → App ID capability

1. [Identifiers](https://developer.apple.com/account/resources/identifiers/list) → **com.axisseattlehousing.app**
2. Enable **Sign in with Apple** → Save

Ignore the **Keys** tab (`9872GVCALV` is an APNs push key, not Sign in with Apple OAuth).

## Step 3 — iOS entitlements & plugin (already in repo)

- `ios/App/App/App.entitlements` includes `com.apple.developer.applesignin`
- npm package: `@capacitor-community/apple-sign-in`
- After pulling: `npm install && npx cap sync ios`

Rebuild in Xcode or `npm run cap:ios:run` — **not** plain Expo Go; use a dev client / TestFlight / device build.

## Step 4 — Code path

| Surface | Flow |
|---------|------|
| **iOS app** | `AppleSignInButton` → `startAppleSignIn` → native `SignInWithApple.authorize` → `supabase.auth.signInWithIdToken` → save `full_name` on first sign-in → `/auth/continue` (or role-specific finish route) |
| **Web** | `startAppleSignIn` falls back to `signInWithOAuth({ provider: 'apple' })` |

## Step 5 — Test

1. **Rebuild the native shell** after installing the plugin (hot reload is not enough):
   ```bash
   npm run cap:ios:run
   ```
   Or open Xcode (`npm run cap:ios`), Clean Build Folder, then Run.
2. Physical iPhone or TestFlight build (Simulator can be flaky).
3. Tap **Continue with Apple** on sign-in or create-account.

If you see `"SignInWithApple" plugin is not implemented on ios`, the installed app predates the plugin — run the rebuild above.

## App Store 4.8

Offering Sign in with Apple on the iOS app satisfies Apple's login requirement when other third-party sign-in (Google) is present.
