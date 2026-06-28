# Stripe go-live (real payments)

The **TEST MODE** badge on Checkout means your app is using **test keys** (`sk_test_…`, `pk_test_…`). No code change is required to accept real money — you switch keys, prices, and webhooks in Stripe and your hosting env.

## 1. Complete Stripe account activation

In [Stripe Dashboard](https://dashboard.stripe.com), finish **Activate your account** (business details, bank account for payouts). Live charges are blocked until activation is complete.

## 2. Turn off Test mode

Dashboard top-right: toggle **Test mode → OFF**. You are now in **Live mode**.

## 3. Create live products and prices

**Product catalog → Add product** (live mode):

| Product | Monthly | Annual |
|---------|---------|--------|
| Axis Pro | $20/mo | $192/yr |
| Axis Business | $200/mo | $1,920/yr |

Or, with your **live** secret key in `.env.local`:

```bash
# Temporarily set STRIPE_SECRET_KEY=sk_live_… in .env.local only (never commit)
npm run stripe:setup-plans
```

Copy the four `price_…` IDs — they are **different** from test mode price IDs.

## 4. Live API keys

**Developers → API keys** (live mode):

| Env var | Value |
|---------|--------|
| `STRIPE_SECRET_KEY` | `sk_live_…` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_…` |

## 5. Live webhook (production)

**Developers → Webhooks → Add endpoint** (live mode):

- **URL:** `https://axis-2.vercel.app/api/stripe/webhook` (or your production domain)
- **Events:**
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
- Copy **Signing secret** → `STRIPE_WEBHOOK_SECRET` (`whsec_…` for this live endpoint)

Do **not** use `stripe listen` signing secrets in production — those are for local test forwarding only.

## 6. Billing portal

**Settings → Billing → Customer portal** (live mode): enable so managers can update cards and cancel from `/portal/plan`.

## 7. Apple Pay for subscriptions

Manager Pro/Business checkout supports **Apple Pay** via Stripe dynamic payment methods.

1. **Settings → Payment methods** — enable **Apple Pay**.
2. Register domains:
   ```bash
   node --env-file=.env.local scripts/setup-stripe-apple-pay-domains.mjs
   ```
3. Test on Safari (HTTPS) at `/partner/pricing` or `/portal/plan`.

Full guide: [`docs/stripe-apple-pay-subscriptions.md`](stripe-apple-pay-subscriptions.md).

## 8. Update hosting (Vercel)

Project → **Settings → Environment Variables** → Production:

```
NEXT_PUBLIC_APP_URL=https://axis-2.vercel.app
STRIPE_SECRET_KEY=sk_live_…
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_…
STRIPE_WEBHOOK_SECRET=whsec_…   (live endpoint secret)
STRIPE_PRICE_PRO_MONTHLY=price_…
STRIPE_PRICE_PRO_ANNUAL=price_…
STRIPE_PRICE_BUSINESS_MONTHLY=price_…
STRIPE_PRICE_BUSINESS_ANNUAL=price_…
```

Redeploy after saving.

## 9. Validate

Locally (after updating `.env.local` with live keys):

```bash
npm run stripe:validate-live
```

All checks should pass and mode should report **live** (no TEST MODE badge at checkout).

## 10. Optional live promos

Recreate in **live mode** if you use them:

- `STRIPE_PROMOTION_CODE_ID_FIRST_MONTH_FREE` — FREEFIRST on Pro monthly
- `STRIPE_COUPON_SWITCH_TO_ANNUAL` — monthly → annual switch coupon

## Keep test mode for local dev

Recommended: keep **test keys** in local `.env.local` for development, and **live keys** only in Vercel Production. Never commit either set to git.
