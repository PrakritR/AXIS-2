# Supabase and Stripe setup (Axis)

This app uses **Supabase Auth** for logins and **Stripe Checkout** (subscription mode) so managers pay before creating a password. Portal tables are empty until you wire your own queries; **public listings** still use local mock inventory.

## 1. Supabase

1. Create a project at [https://supabase.com](https://supabase.com).
2. In **Project Settings → API**, copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (keep secret; server-only)
3. Open **SQL Editor** and run the migration in `supabase/migrations/20250418140000_profiles_manager_purchases.sql`.
4. **Authentication → Providers**: enable **Email** (password). Enable **Google** and add your Google OAuth client ID/secret (see below).
5. **URL configuration** (Auth): set site URL to your production domain (`NEXT_PUBLIC_CANONICAL_APP_URL` or `NEXT_PUBLIC_APP_URL`) and add redirect URLs:
   - `{your-domain}/auth/callback`
   - `http://localhost:3000/auth/callback` for local dev (if using localhost)

For shareable onboarding links and QR codes, set `NEXT_PUBLIC_CANONICAL_APP_URL` to your custom domain so links do not use the default `*.vercel.app` deployment URL.

### Profiles and manager purchases

- `profiles`: one row per user (`id` = `auth.users.id`), `role`, optional `manager_id`, `application_approved` for residents.
- `manager_purchases`: written when Stripe checkout completes; links `stripe_checkout_session_id`, `email`, `manager_id`, and later `user_id` when the manager finishes password setup.

### Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com/), create an OAuth 2.0 **Web application** client.
2. Add **Authorized redirect URI**: `https://<your-supabase-project-ref>.supabase.co/auth/v1/callback`
3. In Supabase **Authentication → Providers → Google**, paste the client ID and secret, then enable Google.
4. In Google Cloud **Credentials → your OAuth client → Authorized redirect URIs**, add **only** the Supabase callback (copy from Supabase Google provider screen):

   `https://<your-project-ref>.supabase.co/auth/v1/callback`

   Do **not** put your website URL (`https://www.axis-seattle-housing.com/auth/callback`) here — that causes `redirect_uri_mismatch`.

5. Ensure `{your-domain}/auth/callback` is listed under Supabase **Authentication → URL configuration → Redirect URLs** (not in Google Cloud redirect URIs).
6. Users sign in at `/auth/sign-in` via **Continue with Google**. Existing Axis accounts match by email; new Google users without a profile are sent through `/auth/continue` (create an account first if you are not already provisioned).

### Google “Continue to …” branding (show Axis, not supabase.co)

Google’s account picker shows **“to continue to {domain}”** based on your OAuth client’s **redirect URI host**. With Supabase Auth, that host is `*.supabase.co`, so users may see `qahnczmilgptcedaqype.supabase.co` until you brand the consent screen.

**In [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → OAuth consent screen:**

1. Set **App name** to `Axis` (or `Axis Seattle Housing`).
2. Upload your **App logo** (square, at least 120×120 px — use your Axis mark).
3. Set **User support email** and **Developer contact** to your team address.
4. Under **Authorized domains**, add `axis-seattle-housing.com` (and `supabase.co` if not already present).
5. Add **Application home page**: `https://www.axis-seattle-housing.com`
6. Add **Privacy policy** and **Terms of service** URLs on your domain (required for production / verification).
7. Publish the consent screen to **Production** when ready (Testing mode only allows listed test users).

After saving, new sign-ins should show your **Axis** name and logo (like other apps’ “Continue to Yelp” screen). The subtitle may still mention the Supabase hostname in some cases; fully replacing it requires a [Supabase custom auth domain](https://supabase.com/docs/guides/auth/auth-helpers/auth-ui#custom-domains) (paid add-on) so the redirect host is `auth.axis-seattle-housing.com`.

**Checklist:**

| Where | What to set |
|-------|-------------|
| Google OAuth consent screen | App name **Axis**, logo, home page, privacy/terms |
| Google Credentials → OAuth client | Redirect URI = `https://<project-ref>.supabase.co/auth/v1/callback` only |
| Supabase → Auth → URL config | Site URL = `https://www.axis-seattle-housing.com`, redirect URLs include `/auth/callback` |
| Supabase → Auth → Google provider | Same Google client ID + secret as Cloud Console |

### Tenant screening (Certn)

1. Create a [Certn](https://certn.co) partner account with API access (pay-per-report).
2. Set `CERTN_API_KEY` and `CERTN_WEBHOOK_SECRET` in `.env.local`.
3. In Certn **Partner settings**, enable webhooks pointing to `{NEXT_PUBLIC_APP_URL}/api/webhooks/screening/certn`.
4. Managers choose screening mode on **Applications** → **Off**, **Manual per applicant**, or **Auto on submit**.
5. Each report bills the manager’s Stripe card on file (`SCREENING_COST_CENTS`, default $39.99) before Certn is called.

## 2. Stripe

1. Create or open your [Stripe Dashboard](https://dashboard.stripe.com).
2. **Developers → API keys**: copy **Secret key** → `STRIPE_SECRET_KEY`.
3. **Product catalog**: create **subscription** recurring prices for **Pro** and **Business** (monthly and annual). **Free does not use Stripe** — signup uses `/api/manager/signup-intent` with no card. Copy each **Price ID** (`price_...`) into the matching env var in `.env.example`:
   - `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_ANNUAL`, etc.
   - Or run `npm run stripe:setup-plans` (requires `STRIPE_SECRET_KEY` in `.env.local`) to create/verify products and write price IDs automatically.
4. **Developers → Webhooks → Add endpoint**  
   - URL: `{NEXT_PUBLIC_APP_URL}/api/stripe/webhook`  
   - Events: at minimum `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.updated`, `customer.subscription.deleted`, and `invoice.paid`  
   - Copy **Signing secret** → `STRIPE_WEBHOOK_SECRET`
   - **Local dev:** `npm run stripe:listen` (requires [Stripe CLI](https://stripe.com/docs/stripe-cli)) and paste the printed `whsec_…` into `.env.local`
5. Use **Stripe test mode** locally; use **live keys** only in production with live price IDs. See [`docs/stripe-go-live.md`](docs/stripe-go-live.md) for the full go-live checklist.

Validate env wiring:

```bash
npm run stripe:validate        # test or live — checks keys + prices
npm run stripe:validate-live   # fails unless sk_live_ / pk_live_ are set
```

### Promo `FREEFIRST` (first month free, Pro monthly only)

Checkout only shows the Stripe promotion-code field for **Pro + monthly**; the app rejects `FREEFIRST` for any other tier/billing.

1. In **Product catalog**, open your **Pro monthly** recurring price and copy its **Price ID** (`price_…`).
2. **Product catalog → Coupons → Create coupon**:
   - **Percent off**: `100` (or use **Amount off** equal to one month if you prefer).
   - **Duration**: **Once** (applies to the first subscription invoice = first month on monthly billing).
   - **Applies to**: **Specific products** → choose the product that contains **only** the Pro monthly price, or use **Eligible items** so the coupon applies exclusively to that `price_…` (Stripe UI: restrict to the Pro monthly price so it cannot be used on Business or annual).
3. **Product catalog → Coupons** → open the coupon → **Promotion codes** → **Add promotion code**:
   - **Code**: `FREEFIRST` (must match exactly; codes are not case-sensitive in Stripe for entry, but use this spelling).
4. Test in Checkout (Pro, Monthly): the embedded form includes “Add promotion code”; enter `FREEFIRST` and confirm the first invoice is $0.

## 3. Local environment

Copy `.env.example` to `.env.local` and fill all variables. Set:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Restart `npm run dev` after changes.

## 4. Flows implemented

| Flow | What happens |
|------|----------------|
| **Manager paid signup** | Partner pricing → `POST /api/stripe/checkout` → Stripe → success → `/auth/create-manager?session_id=...` → `POST /api/auth/manager-signup` creates Supabase user + `profiles` row with `manager_id` from checkout metadata. |
| **Webhook** | `checkout.session.completed` upserts `manager_purchases` (idempotent). |
| **Sign in** | `/auth/sign-in` uses `signInWithPassword` and reads `profiles.role` for redirect. |
| **Resident / owner** | `/auth/create-account` uses `signUp` + client `profiles` insert (requires RLS insert policy and usually email confirm off in dev). |
| **Admin** | `POST /api/auth/register-admin` validated server-side against the server-only `AXIS_ADMIN_REGISTER_KEY` (never sent to the browser). |

## 5. Your checklist

- [ ] Run SQL migration in Supabase.
- [ ] Set all Supabase env vars in hosting (Vercel, etc.).
- [ ] Create Stripe prices and webhook; set Stripe env vars.
- [ ] Set `NEXT_PUBLIC_APP_URL` to production origin.
- [ ] Set a strong random `AXIS_ADMIN_REGISTER_KEY` in production (admin registration is disabled if unset). Remove any legacy `NEXT_PUBLIC_AXIS_ADMIN_REGISTER_KEY` and rotate the previously exposed key.
- [ ] Set `AXIS_PAYMENT_WAIVER_CODE` only if you intend to allow a Stripe-bypass code in production (waiver is disabled when unset).
- [ ] Decide email confirmation policy for Auth.
- [ ] Replace empty portal UI with real queries when backends are ready.
