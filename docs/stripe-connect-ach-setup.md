# Stripe Connect + ACH setup (resident portal payments)

ACH bank transfers are **only** for resident rent/utility payments. Rental **application fees** are paid online by card / Apple Pay / Google Pay — see [`stripe-apple-pay-payments.md`](stripe-apple-pay-payments.md). Manager Pro/Business subscriptions use **card**, not ACH.

## Architecture

```
Resident pays rent + processing/service fee (ACH: 0.8% capped at $5)
    → Stripe Checkout (us_bank_account)
    → Resident's fee add-on retained by Axis via application_fee_amount
    → Full charge subtotal transferred to manager Connect account (acct_…)
    → Manager receives payout to their linked bank
```

Fee model (who pays what): see [`docs/agents/resident-payments.md`](agents/resident-payments.md).

Each manager gets a **Stripe Connect Express** account stored in `profiles.stripe_connect_account_id`.

---

## Part A — Platform setup (you, once)

### A1. Stripe Dashboard — activate Connect

1. [Stripe Dashboard](https://dashboard.stripe.com) → **Connect** → **Get started**.
2. Complete platform profile (business name, support email, etc.).
3. Choose **Express** connected accounts (Axis creates these for managers).

### A2. Enable ACH on the platform

**Settings → Payment methods** → enable **ACH Direct Debit** (US bank accounts).

### A3. Local `.env.local` (test mode recommended)

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000

NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=…
SUPABASE_SERVICE_ROLE_KEY=…

STRIPE_SECRET_KEY=sk_test_…
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…   # from `npm run stripe:listen`
```

Subscription price IDs (`STRIPE_PRICE_*`) are for manager plans only — not required for ACH resident payments.

Validate: `npm run stripe:validate`

### A4. Supabase migration

Run in SQL Editor if not already applied:

`supabase/migrations/20250421120000_profiles_stripe_connect_account.sql`

### A5. Webhooks (local)

```bash
# Terminal 1
npm run dev

# Terminal 2
stripe login
npm run stripe:listen
```

Copy `whsec_…` → `STRIPE_WEBHOOK_SECRET` → restart dev server.

Required events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`

---

## Part B — Manager Connect onboarding (each manager)

1. Sign in as manager → **Portal → Payments → Payouts** (`/portal/payments/payouts`).
2. Complete embedded Stripe onboarding (identity, business info, **bank account for payouts**).
3. Wait for badge **Payouts ready** (transfers + payouts active).

Until this is done, residents see errors when trying ACH and should use Zelle/Venmo if enabled.

---

## Part C — Property + resident setup

### C1. Enable PropLane payments on listing

**Properties → edit listing → Resident payment methods** → check **PropLane payments with Stripe**. One checkbox enables both rails: rent by bank (ACH), card, or Link, and the application fee by card / Apple Pay.

### C2. Manager creates a charge

**Portal → Payments → Add payment** (rent, utility, etc.) for the resident’s email.

### C3. Resident pays

**Resident portal → Payments → Pay with bank (ACH)**.

Test bank (Stripe test mode):

| Routing | Account |
|---------|---------|
| `110000000` | `000123456789` |

---

## Part D — Production (Vercel)

Same keys pattern with **live** mode:

| Variable | Source |
|----------|--------|
| `STRIPE_SECRET_KEY` | `sk_live_…` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | Live webhook endpoint (not `stripe listen`) |
| `NEXT_PUBLIC_APP_URL` | `https://your-domain.com` |

Live webhook URL: `https://your-domain.com/api/stripe/webhook`

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| “Stripe Connect is not activated” | Finish Connect setup in Dashboard (Part A1) |
| Demo / keys missing message | Set `STRIPE_SECRET_KEY` + `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, restart dev |
| `MANAGER_NO_CONNECT_ACCOUNT` | Manager completes Payouts onboarding |
| `AXIS_PAYMENTS_DISABLED` | Enable **PropLane payments with Stripe** on the property listing |
| Charge stays pending after ACH | Check `stripe listen` + webhook secret |
| Restricted Connect account | Manager completes outstanding requirements in Payouts |
