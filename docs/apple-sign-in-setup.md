# Sign in with Apple (native iOS + web)

Axis uses **Capacitor** (not Expo). Native iOS sign-in exchanges an Apple `identityToken` with Supabase via `signInWithIdToken`; Safari/desktop uses Supabase OAuth redirect.

Gating: `isAppleSignInAvailable()` in `src/lib/auth/apple-sign-in-config.ts` — **iOS app always shows Apple** when Google is offered (App Store 4.8); **web hides the button** until `NEXT_PUBLIC_APPLE_SIGN_IN_ENABLED=true`.

## Native iOS checklist

| Step | Where | What |
|------|--------|------|
| 1 | Supabase → Authentication → Providers → **Apple** | Enable, set **Client IDs** to `com.axisseattlehousing.app` |
| 2 | Supabase → Authentication → URL configuration → **Redirect URLs** | Add native scheme callbacks (see below) |
| 3 | Apple Developer → App ID | Enable **Sign in with Apple** on `com.axisseattlehousing.app` |
| 4 | iOS project | Rebuild native shell after plugin changes (`npm run cap:ios:run`) |

**Supabase Apple provider (native):**

| Field | Value |
|-------|--------|
| **Enable** | ON |
| **Client IDs** | `com.axisseattlehousing.app` only (bundle ID — **not** an APNs Key ID) |
| **Secret Key (for OAuth)** | Leave **blank** — native uses `signInWithIdToken`, not web OAuth |
| **Callback URL** | `https://<project-ref>.supabase.co/auth/v1/callback` (set by Supabase) |

**Native redirect URLs** (Supabase → URL configuration):

```
com.axisseattlehousing.app://auth/callback
com.axisseattlehousing.app://auth/callback/partner-pricing
com.axisseattlehousing.app://auth/callback/resident-signup
com.axisseattlehousing.app://auth/callback/vendor-signup
com.axisseattlehousing.app://auth/callback/**
```

**Apple Developer:** [Identifiers](https://developer.apple.com/account/resources/identifiers/list) → `com.axisseattlehousing.app` → enable Sign in with Apple. No Services ID or `.p8` secret needed for native.

**Already in repo:** `ios/App/App/App.entitlements` (`com.apple.developer.applesignin`), `@capacitor-community/apple-sign-in`.

**Flow:** `AppleSignInButton` → `startAppleSignIn` → `SignInWithApple.authorize` → `supabase.auth.signInWithIdToken` → `/auth/continue` (or role-specific finish route).

## Web (Safari / desktop) checklist

| Step | Where | What |
|------|--------|------|
| 1 | Supabase → Authentication → Providers → **Apple** | Enable + configure web OAuth (Services ID + secret — see below) |
| 2 | Supabase → Authentication → URL configuration → **Redirect URLs** | Add HTTPS callbacks (see below) |
| 3 | Apple Developer → **Services ID** | Domains + return URL = Supabase callback |
| 4 | `.env.local` | `NEXT_PUBLIC_APPLE_SIGN_IN_ENABLED=true` (after Steps 1–3) |

**Supabase Apple provider (web OAuth):**

| Field | Value |
|-------|--------|
| **Enable** | ON |
| **Client IDs** | `com.axisseattlehousing.app,<your-services-id>` (bundle ID + Services ID, comma-separated) |
| **Secret Key** | Generate in Supabase from Apple `.p8` key (rotating JWT secret for web OAuth) |
| **Callback URL** | `https://<project-ref>.supabase.co/auth/v1/callback` |

**Web redirect URLs** — minimum for local dev:

```
http://localhost:3000/auth/callback
http://localhost:3000/auth/callback/partner-pricing
http://localhost:3000/auth/callback/resident-signup
http://localhost:3000/auth/callback/vendor-signup
```

Production (replace origin):

```
https://www.axis-seattle-housing.com/auth/callback
https://www.axis-seattle-housing.com/auth/callback/partner-pricing
https://www.axis-seattle-housing.com/auth/callback/resident-signup
https://www.axis-seattle-housing.com/auth/callback/vendor-signup
```

If redirect URLs are missing, Supabase may fall back to **Site URL** (e.g. `http://localhost:3000/`) and OAuth will not return to `/auth/callback`.

**Apple Developer (web only):**

1. Create a **Services ID**
2. Configure Sign in with Apple (domains + return URL = Supabase callback)
3. Add Services ID to Supabase **Client IDs**
4. Generate rotating **Secret Key** in Supabase from your Apple `.p8` key

**Environment variable:**

```bash
# .env.local — only after Apple is enabled and web OAuth is configured in Supabase.
NEXT_PUBLIC_APPLE_SIGN_IN_ENABLED=true
```

Without this, web **hides** "Continue with Apple" (Google is unaffected). The app also probes the Supabase authorize URL before redirect; if Apple is disabled you get a toast instead of a raw JSON error page.

**Flow:** `startAppleSignIn` → `signInWithOAuth({ provider: 'apple' })` → probe authorize URL → redirect to Apple.

Code reference for redirect URL lists: `appleSignInRedirectUrls()` in `src/lib/auth/apple-sign-in-config.ts`.

## Common error (raw JSON page)

If you see:

```json
{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}
```

Apple is **not enabled** in this Supabase project. Complete the checklist for your surface (native vs web) above.

On **web**, the button stays hidden until `NEXT_PUBLIC_APPLE_SIGN_IN_ENABLED=true`. If you enabled the env var but not Supabase, the probe shows a setup toast instead of this page.

## Test

**Native iOS**

1. Rebuild: `npm run cap:ios:run` (or Xcode Clean Build → Run)
2. Physical iPhone or TestFlight (Simulator can be flaky)
3. Tap **Continue with Apple**

If you see `"SignInWithApple" plugin is not implemented on ios`, the installed app predates the plugin — rebuild.

**Web**

1. Set `NEXT_PUBLIC_APPLE_SIGN_IN_ENABLED=true` in `.env.local` and restart `next dev`
2. Confirm Apple provider + redirect URLs in Supabase
3. Open `/auth/sign-in` on laptop — **Continue with Apple** should appear and complete OAuth

## App Store 4.8

Offering Sign in with Apple on the iOS app satisfies Apple's login requirement when other third-party sign-in (Google) is present.
