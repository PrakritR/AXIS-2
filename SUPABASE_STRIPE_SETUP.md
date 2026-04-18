# Supabase and Stripe setup (Axis)

This app uses **Supabase Auth** for logins and **Stripe Checkout** (subscription mode) so managers pay before creating a password. Portal tables are empty until you wire your own queries; **public listings** still use local mock inventory.

## 1. Supabase

1. Create a project at [https://supabase.com](https://supabase.com).
2. In **Project Settings → API**, copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (keep secret; server-only)
3. Open **SQL Editor** and run the migration in `supabase/migrations/20250418140000_profiles_manager_purchases.sql`.
4. **Authentication → Providers**: enable **Email** (password). For development you may disable **Confirm email** under Auth settings so sign-up can insert `profiles` immediately; in production keep confirmations on and confirm email before expecting a `profiles` row from client sign-up.
5. **URL configuration** (Auth): add site URL `NEXT_PUBLIC_APP_URL` and redirect URL `{NEXT_PUBLIC_APP_URL}/auth/callback` if you add magic links later.

### Profiles and manager purchases

- `profiles`: one row per user (`id` = `auth.users.id`), `role`, optional `manager_id`, `application_approved` for residents.
- `manager_purchases`: written when Stripe checkout completes; links `stripe_checkout_session_id`, `email`, `manager_id`, and later `user_id` when the manager finishes password setup.

## 2. Stripe

1. Create or open your [Stripe Dashboard](https://dashboard.stripe.com).
2. **Developers → API keys**: copy **Secret key** → `STRIPE_SECRET_KEY`.
3. **Product catalog**: create **subscription** prices for each tier and billing interval you sell (Free can be a $0/month recurring price so the same checkout code path works). Copy each **Price ID** (`price_...`) into the matching env var in `.env.example`:
   - `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_ANNUAL`, etc.
4. **Developers → Webhooks → Add endpoint**  
   - URL: `{NEXT_PUBLIC_APP_URL}/api/stripe/webhook`  
   - Events: at minimum `checkout.session.completed`  
   - Copy **Signing secret** → `STRIPE_WEBHOOK_SECRET`
5. Use **Stripe test mode** locally; use **live keys** only in production with live price IDs.

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
| **Admin** | `POST /api/auth/register-admin` with registration key. |

## 5. Your checklist

- [ ] Run SQL migration in Supabase.
- [ ] Set all Supabase env vars in hosting (Vercel, etc.).
- [ ] Create Stripe prices and webhook; set Stripe env vars.
- [ ] Set `NEXT_PUBLIC_APP_URL` to production origin.
- [ ] Decide email confirmation policy for Auth.
- [ ] Replace empty portal UI with real queries when backends are ready.
