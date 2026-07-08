# Sign in with Apple (native iOS + web)

Axis uses **Capacitor** (not Expo). Native iOS sign-in exchanges an Apple `identityToken` with Supabase via `signInWithIdToken`; Safari/desktop uses Supabase OAuth redirect.

Gating: `isAppleSignInAvailable()` in `src/lib/auth/apple-sign-in-config.ts` — **iOS app always shows Apple** when Google is offered (App Store 4.8); **web shows Apple by default** alongside Google. Set `NEXT_PUBLIC_APPLE_SIGN_IN_ENABLED=false` to hide on web. On web, the app probes the Supabase authorize URL once per tab; misconfiguration shows an actionable toast (deduped per session) instead of a raw JSON error page.

## Two surfaces, two Supabase configs

| Surface | Supabase Apple config | Apple Developer |
|---------|----------------------|-----------------|
| **iOS app** (Capacitor) | Bundle ID in Client IDs, **Secret Key blank** | App ID with Sign in with Apple |
| **Laptop / web** (Safari, Chrome) | Bundle ID **+ Services ID** in Client IDs, **Secret Key required** | Services ID + `.p8` signing key |

**Enabling Apple for native iOS does not make laptop/web work.** A bundle-ID-only setup (blank secret) is correct for the app but Supabase returns `Unsupported provider: missing OAuth secret` for web OAuth.

## Dev vs production Supabase

Axis uses **two Supabase projects** (see [`docs/database-environments.md`](database-environments.md)):

| Project | Ref | Apple provider |
|---------|-----|----------------|
| **Dev + test** (local `npm run dev`, vitest) | `emstjswhotsnyksqhqyf` | Enable Apple here for localhost |
| **Production** (Vercel Production deploy) | `qahnczmilgptcedaqype` | Enable Apple here for the live site |

**Enabling Apple on production does not enable it on dev/test.** Local `.env` / `.env.local` must point at the dev/test project (`emstjswhotsnyksqhqyf`). Configure Authentication → Providers → Apple on **that** project for localhost sign-in to work.

Each project has its own callback URL: `https://<project-ref>.supabase.co/auth/v1/callback`. Confirm you are editing the project that matches `NEXT_PUBLIC_SUPABASE_URL` in your env file.

---

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

---

## Laptop / web checklist

Use this when **Continue with Apple** on `/auth/sign-in` shows a toast about web OAuth, missing secret, or redirect URLs.

| Step | Where | What |
|------|--------|------|
| 1 | Confirm env | `NEXT_PUBLIC_SUPABASE_URL` points at the project you configured (dev: `emstjswhotsnyksqhqyf`) |
| 2 | Supabase → Authentication → Providers → **Apple** | Enable + **Services ID** in Client IDs + **Secret Key** (see below) |
| 3 | Supabase → Authentication → URL configuration → **Redirect URLs** | Add HTTPS callbacks (see below) |
| 4 | Apple Developer → **Services ID** | Domains + return URL = Supabase callback |
| 5 | `.env.local` | Optional: `NEXT_PUBLIC_APPLE_SIGN_IN_ENABLED=false` to hide the web button |

**Supabase Apple provider (web OAuth):**

| Field | Value |
|-------|--------|
| **Enable** | ON |
| **Client IDs** | `com.axisseattlehousing.app,com.axisseattlehousing.app.web` (bundle ID + Services ID, comma-separated) |
| **Secret Key** | Generate in Supabase from Apple `.p8` key (rotating JWT secret for web OAuth) — **cannot be blank** |
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

Use a **Services ID** — not a Website Push ID, not the iOS App ID alone.

| Field | Dev/test value |
|-------|----------------|
| Identifier type | **Services IDs** |
| Identifier | `com.axisseattlehousing.app.web` |
| Team ID | `8FH3GVHCZ9` |
| Sign in with Apple key | `9872GVCALV` (file: `AuthKey_9872GVCALV.p8`) |

**Portal steps** ([Identifiers](https://developer.apple.com/account/resources/identifiers/list)):

1. **Identifiers** → filter **Services IDs** (not App IDs, not Website Push IDs).
2. If `com.axisseattlehousing.app.web` is missing → **+** → **Services IDs** → Description e.g. "Axis web OAuth" → Identifier `com.axisseattlehousing.app.web` → Register.
3. Open the Services ID → enable **Sign in with Apple** → **Configure**.
4. **Primary App ID:** `com.axisseattlehousing.app`.
5. **Domains and Subdomains:** `emstjswhotsnyksqhqyf.supabase.co` (use `<project-ref>.supabase.co` for the project in `NEXT_PUBLIC_SUPABASE_URL`).
6. **Return URLs:** `https://emstjswhotsnyksqhqyf.supabase.co/auth/v1/callback` — exact match, HTTPS, no trailing slash.
7. **Keys** ([Keys list](https://developer.apple.com/account/resources/authkeys/list)): confirm key `9872GVCALV` exists with **Sign in with Apple** enabled (Team `8FH3GVHCZ9`). Download `.p8` once; filename is `AuthKey_9872GVCALV.p8`.

**Localhost:** do **not** add `http://localhost:3000` to Apple return URLs. Web flow is: browser → Supabase → Apple → Supabase callback → your app. Only the Supabase callback goes in Apple; localhost URLs belong in Supabase **Redirect URLs** only.

**Diagnose without opening a browser:**

```bash
npm run apple:diagnose
```

**Apply Supabase config (Management API):** with a [personal access token](https://supabase.com/dashboard/account/tokens), run:

```bash
SUPABASE_ACCESS_TOKEN=... node scripts/configure-apple-web-oauth.mjs \
  --p8 ~/Downloads/AuthKey_9872GVCALV.p8 \
  --project-ref emstjswhotsnyksqhqyf
```

The script generates the JWT from the `.p8` file (never written to git) and PATCHes Apple provider + redirect URLs on the dev/test project.

**Environment variable (optional):**

```bash
# .env.local — only set to hide Apple on web. Shown by default on sign-in and create-account.
# NEXT_PUBLIC_APPLE_SIGN_IN_ENABLED=false
```

Web **shows** "Continue with Apple" on `/auth/sign-in` and `/auth/create-account` by default. Set `NEXT_PUBLIC_APPLE_SIGN_IN_ENABLED=false` to hide the web button regardless of Supabase.

**Flow:** `startAppleSignIn` → `resolveAppleWebOAuthSignIn` (cached per tab + redirect URL) → `signInWithOAuth({ provider: 'apple', redirectTo })` → probe authorize URL → redirect to Apple.

**Redirect URL helper:** web OAuth uses `appleWebOAuthRedirectUrl(origin, fixedCallbackPath?)` in `src/lib/auth/apple-sign-in-config.ts` — same value passed to `signInWithOAuth` as `redirectTo` (via `resolveOAuthCallbackRedirectUrl`).

Code reference for full redirect URL lists: `appleSignInRedirectUrls()` in `src/lib/auth/apple-sign-in-config.ts`.

---

## Common errors

### Raw JSON: provider not enabled

```json
{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}
```

Apple is **not enabled** in this Supabase project. Enable Authentication → Providers → Apple on the project matching `NEXT_PUBLIC_SUPABASE_URL`.

### Raw JSON: missing OAuth secret (bundle-ID-only config)

```json
{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: missing OAuth secret"}
```

Apple is enabled but configured for **native iOS only** (bundle ID, blank secret). Laptop/web needs the [Laptop / web checklist](#laptop--web-checklist): Services ID + Secret Key + redirect URLs.

The app maps this to an actionable toast (not “not enabled”).

### Redirect URL not allowlisted

Supabase may return a message containing `redirect url is not allowed`. Add `http://localhost:3000/auth/callback` (and other `/auth/callback/*` paths you use) under Authentication → URL configuration → Redirect URLs.

### `invalid_client` / "Invalid client" on appleid.apple.com

Apple shows this **after** Supabase redirects you to `appleid.apple.com` — Supabase auth is working; Apple does not recognize the OAuth `client_id`.

**Quick diagnose:**

```bash
npm run apple:diagnose
```

When Supabase is OK but Apple fails, output ends with `FAIL — Apple authorize page: invalid_client`.

**What Apple receives:** Supabase web OAuth sends `client_id=com.axisseattlehousing.app.web` (the **Services ID**, not the iOS bundle ID). Verify without opening the browser:

```bash
# Uses NEXT_PUBLIC_* from .env.local — prints client_id only, no secrets
node -e "
const fs=require('fs'); const e=fs.readFileSync('.env.local','utf8');
const g=k=>(e.match(new RegExp('^'+k+'=(.*)$','m'))||[])[1]?.trim();
const base=g('NEXT_PUBLIC_SUPABASE_URL').replace(/\\/\$/,'');
const key=g('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const u=base+'/auth/v1/authorize?provider=apple&redirect_to='+encodeURIComponent('http://localhost:3000/auth/callback');
fetch(u,{redirect:'manual',headers:{apikey:key,Authorization:'Bearer '+key}}).then(r=>{
  const loc=r.headers.get('location'); if(!loc){console.log('no redirect');return;}
  console.log('client_id:', new URL(loc).searchParams.get('client_id'));
  console.log('redirect_uri:', new URL(loc).searchParams.get('redirect_uri'));
});
"
```

Expected output for dev/test:

| Param | Value |
|-------|--------|
| `client_id` | `com.axisseattlehousing.app.web` |
| `redirect_uri` | `https://emstjswhotsnyksqhqyf.supabase.co/auth/v1/callback` |

**Root cause (most common):** The Services ID `com.axisseattlehousing.app.web` was **assumed in repo docs/scripts but never created** in Apple Developer — or a **Website Push ID** was created instead (wrong type). The iOS app only registers the **bundle ID** `com.axisseattlehousing.app` (App ID) — that alone does not satisfy web OAuth.

**Fix — Apple Developer checklist** ([Identifiers](https://developer.apple.com/account/resources/identifiers/list)):

| Step | Action |
|------|--------|
| 0 | Confirm you are on **Services IDs**, not Website Push IDs or App IDs |
| 1 | **Identifiers** → **+** → **Services IDs** → Register identifier `com.axisseattlehousing.app.web` (or pick another ID and update Supabase + `scripts/configure-apple-web-oauth.mjs` + `APPLE_WEB_SERVICES_ID` in `apple-sign-in-config.ts` to match) |
| 2 | Open the Services ID → enable **Sign in with Apple** → **Configure** |
| 3 | **Primary App ID:** select `com.axisseattlehousing.app` |
| 4 | **Domains and Subdomains:** `emstjswhotsnyksqhqyf.supabase.co` (dev/test) — use `<project-ref>.supabase.co` for the project in `NEXT_PUBLIC_SUPABASE_URL` |
| 5 | **Return URLs:** `https://emstjswhotsnyksqhqyf.supabase.co/auth/v1/callback` (must match Supabase callback exactly; no `localhost` here) |
| 6 | **Keys:** confirm Sign in with Apple key **`9872GVCALV`** (Team `8FH3GVHCZ9`) — not `9872GVHCV`; download `AuthKey_9872GVCALV.p8` |

**Fix — Supabase (after Services ID exists):**

| Field | Value |
|-------|--------|
| **Client ID** (primary) | `com.axisseattlehousing.app.web` |
| **Additional client IDs** | `com.axisseattlehousing.app` |
| **Secret Key** | JWT from `.p8` with `sub` = **Services ID** (`com.axisseattlehousing.app.web`), not the bundle ID |

Re-apply with the configure script (does not commit secrets):

```bash
SUPABASE_ACCESS_TOKEN=... node scripts/configure-apple-web-oauth.mjs \
  --p8 ~/Downloads/AuthKey_9872GVCALV.p8 \
  --project-ref emstjswhotsnyksqhqyf
```

**Other causes of `invalid_client`:**

- JWT `sub` is the bundle ID instead of the Services ID (script uses Services ID — re-run script if you edited Supabase manually)
- Wrong Team ID or Key ID in the JWT (script uses Team `8FH3GVHCZ9`, Key `9872GVCALV`)
- Services ID exists but Sign in with Apple is not enabled, or domain/return URL typo (must be HTTPS, no trailing slash on return URL)

## Test

**Native iOS**

1. Rebuild: `npm run cap:ios:run` (or Xcode Clean Build → Run)
2. Physical iPhone or TestFlight (Simulator can be flaky)
3. Tap **Continue with Apple**

If you see `"SignInWithApple" plugin is not implemented on ios`, the installed app predates the plugin — rebuild.

**Web / laptop**

1. Confirm `NEXT_PUBLIC_SUPABASE_URL` matches the project where Apple is configured
2. Run `npm run apple:diagnose` — should pass after Apple Developer setup
3. Complete the [Laptop / web checklist](#laptop--web-checklist) (Services ID, secret, redirect URLs)
4. Open `/auth/sign-in` — **Continue with Apple** should redirect to Apple and return to `/auth/callback`

## App Store 4.8

Offering Sign in with Apple on the iOS app satisfies Apple's login requirement when other third-party sign-in (Google) is present.
