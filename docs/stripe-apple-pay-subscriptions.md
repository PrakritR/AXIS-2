# Apple Pay for manager subscriptions

Manager **Pro** and **Business** subscriptions use **Stripe Checkout** (embedded on pricing / plan pages). Apple Pay is enabled through Stripe’s **dynamic payment methods** — the same checkout flow serves web, iOS app WebView, and Safari.

## Architecture

| Layer | Location |
| --- | --- |
| Shared session builder | `src/lib/stripe/subscription-checkout-session.ts` |
| New signup checkout | `src/lib/stripe/manager-checkout.ts` → `/api/stripe/checkout` |
| Portal upgrade checkout | `/api/stripe/checkout-portal` |
| Embedded UI | `src/components/stripe-embedded-checkout.tsx` |

**Important:** Subscription checkout must **not** set `payment_method_types: ["card"]` — that blocks Apple Pay. All manager subscription sessions go through `buildManagerSubscriptionCheckoutBase()`.

## One-time Stripe Dashboard setup

1. **Settings → Payment methods** — turn on **Apple Pay** (and **Link** if desired).
2. **Settings → Payment methods → Apple Pay** — complete any business verification Stripe requests.

Optional: create a **Payment method configuration** for subscriptions only (e.g. Apple Pay + Card, no ACH) and set:

```env
STRIPE_SUBSCRIPTION_PAYMENT_METHOD_CONFIGURATION=pmc_...
```

## Register your domains

Apple Pay on Checkout requires each hostname to be registered with Stripe.

```bash
node --env-file=.env.local scripts/setup-stripe-apple-pay-domains.mjs
```

Uses `NEXT_PUBLIC_CANONICAL_APP_URL` and/or `NEXT_PUBLIC_APP_URL` (production hostnames only — not `localhost`).

Check validation status:

```bash
node --env-file=.env.local scripts/setup-stripe-apple-pay-domains.mjs --validate-only
```

Typical production domains for Axis:

- `www.axis-seattle-housing.com`
- `axis-seattle-housing.com` (if you serve checkout on apex)

## Testing

| Environment | Apple Pay |
| --- | --- |
| `localhost` | Not available (use Stripe test card `4242…`) |
| Safari on macOS/iOS (HTTPS) | Yes, when domain is registered |
| Axis iOS app (Capacitor WebView) | Yes, same checkout after Vercel deploy + domain registration |
| Stripe test mode | Apple Pay test wallet in Safari |

1. Open `/partner/pricing` or `/portal/plan` on **Safari** (signed in for portal upgrade).
2. Start Pro/Business checkout — Apple Pay button should appear above card fields when eligible.
3. Complete with Apple Pay test card in Stripe test mode.

## Web + native

Subscription UI is shared (see `docs/web-and-native-parity.md`). Deploy to Vercel — the iOS/Android app picks up Apple Pay on checkout automatically; no App Store rebuild unless you change native shell code.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Only card fields, no Apple Pay | Enable Apple Pay in Dashboard; run domain setup script; use Safari/HTTPS |
| Apple Pay on web but not app | Register the same domain the WebView loads (`www.axis-seattle-housing.com`) |
| `payment_method_types` in code | Remove it — use `buildManagerSubscriptionCheckoutBase()` only |

## Related docs

- [`docs/stripe-go-live.md`](stripe-go-live.md) — live keys and webhooks
- [`SUPABASE_STRIPE_SETUP.md`](../SUPABASE_STRIPE_SETUP.md) — subscription flow overview
