# Supabase and Stripe setup (Axis)

This app uses **Supabase Auth** for logins and **Stripe Checkout** (subscription mode) so managers pay before creating a password. Portal tables are empty until you wire your own queries; **public listings** still use local mock inventory.

## 1. Supabase

1. Create a project at [https://supabase.com](https://supabase.com).
2. In **Project Settings → API**, copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (keep secret; server-only)
3. Apply the schema with the Supabase CLI (do **not** copy migrations into the SQL Editor by hand — that lets environments drift). Install the CLI, then from the repo root:
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   npm run db:push        # applies everything in supabase/migrations/
   ```
   Axis runs two projects (a shared dev/test project and production) that are kept
   identical via these migrations. See [`docs/database-environments.md`](docs/database-environments.md)
   for the full two-project model and the dev → prod push workflow.
4. **Authentication → Providers**: enable **Email** (password). For development you may disable **Confirm email** under Auth settings so sign-up can insert `profiles` immediately; in production keep confirmations on and confirm email before expecting a `profiles` row from client sign-up.
5. **URL configuration** (Auth): add site URL `NEXT_PUBLIC_APP_URL` and redirect URL `{NEXT_PUBLIC_APP_URL}/auth/callback` if you add magic links later.

### Profiles and manager purchases

- `profiles`: one row per user (`id` = `auth.users.id`), `role`, optional `manager_id`, `application_approved` for residents.
- `manager_purchases`: written when Stripe checkout completes; links `stripe_checkout_session_id`, `email`, `manager_id`, and later `user_id` when the manager finishes password setup.

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

- [ ] Apply migrations with `npm run db:push` (CLI), not the SQL Editor.
- [ ] Set all Supabase env vars in hosting (Vercel, etc.). Production Supabase creds live in Vercel only; local `.env` points at the dev/test project. See [`docs/database-environments.md`](docs/database-environments.md).
- [ ] Create Stripe prices and webhook; set Stripe env vars.
- [ ] Set `NEXT_PUBLIC_APP_URL` to production origin.
- [ ] Set a strong random `AXIS_ADMIN_REGISTER_KEY` in production (admin registration is disabled if unset). Remove any legacy `NEXT_PUBLIC_AXIS_ADMIN_REGISTER_KEY` and rotate the previously exposed key.
- [ ] Set `AXIS_PAYMENT_WAIVER_CODE` only if you intend to allow a Stripe-bypass code in production (waiver is disabled when unset).
- [ ] Decide email confirmation policy for Auth.
- [ ] Replace empty portal UI with real queries when backends are ready.
