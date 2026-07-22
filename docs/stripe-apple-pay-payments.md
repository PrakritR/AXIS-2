# Apple Pay for rent & rental-application-fee payments

These are **real-world** payments (housing rent, application fees), exempt from
Apple's IAP rule under App Store Guideline **3.1.5(a)** — so Stripe + Apple Pay is
the correct, compliant processor. (Manager SaaS **subscriptions** are a separate
flow on their own Stripe builder — see
[`stripe-apple-pay-subscriptions.md`](stripe-apple-pay-subscriptions.md) — and
their in-app billing is owned by a separate StoreKit IAP task, not this path. Do
not conflate the two.)

## How Apple Pay is enabled here

Both resident/applicant flows use **Stripe Checkout** and funnel through one
builder, `createAxisAchCheckoutSession()` (`src/lib/stripe-axis-ach-checkout.ts`).

| Flow | Route | Checkout | Method-class |
| --- | --- | --- | --- |
| Rent (household charges) | `/api/stripe/household-charge-checkout` | Embedded (`StripeEmbeddedCheckout`) | resident picks Bank / **Card** / Link |
| Application fee | `/api/stripe/application-fee-checkout` | Hosted redirect | **Card** (was ACH) |

Apple Pay and Google Pay are **card wallets** — they only ride on the **card**
method-class, never on the bank/ACH session. Their Stripe processing fee (2.9% +
$0.30) is identical to a plain card, so the fee line item the builder bakes
*before* creating the session is correct whether the buyer taps Apple Pay, Google
Pay, or types a card. The manager's Connect payout stays the full subtotal on
every method (see [`docs/agents/resident-payments.md`](agents/resident-payments.md)).

**Surfacing the wallets.** Stripe only shows Apple Pay/Google Pay when the session
uses **dynamic payment methods** scoped to card. `paymentMethodStripeConfig()`:

- **Card + `STRIPE_RESIDENT_CARD_PAYMENT_METHOD_CONFIGURATION` set** → omits
  `payment_method_types` and passes that **card-scoped** Payment Method
  Configuration (PMC). This is the recommended path and mirrors the subscription
  flow's dynamic payment methods. The PMC **must exclude bank/ACH** so a card
  session never surfaces a different-fee method — and that is *enforced at
  runtime*, not just documented: before using the PMC the builder retrieves it
  from Stripe (cached 10 min) and checks that no method outside
  card / Apple Pay / Google Pay / Link is enabled. Link is allowed because this
  repo prices it at exactly the card rate, so it cannot skew the baked fee line
  item — and Stripe commonly enables it alongside card. A PMC that also offers
  `us_bank_account`, Klarna, Affirm, … (or a PMC that cannot be retrieved) logs a
  `console.error` and falls back to the explicit `["card"]` allowlist rather than
  creating a session whose baked fee line item could be wrong.
- **Card, no PMC env** → explicit `payment_method_types: ["card"]`. Apple Pay
  still appears on one-time (`mode: "payment"`) Checkout once the domain is
  registered, and this never leaks a wrong-fee method. Safe default.
- **ACH** → explicit `["us_bank_account"]` (its own lower fee). **Link** →
  `["link","card"]`.

Regression coverage: `tests/unit/stripe-axis-ach-checkout.test.ts`.

## Domain verification (required for Apple Pay on our own domain)

Apple Pay on Elements / **embedded** Checkout requires our domain to be
registered with Stripe and the domain-association file hosted:

- **File:** `public/.well-known/apple-developer-merchantid-domain-association`
  (served at `/.well-known/…`). This is **Stripe's** Apple Pay merchant-ID file —
  the same hex blob for every Stripe merchant, not account-specific — so it is
  safe to commit. If Stripe ever rotates it, re-download from
  `https://checkout.stripe.com/.well-known/apple-developer-merchantid-domain-association`
  (or your Dashboard → Settings → Payment methods → Apple Pay → Add domain).
- **Registration:** run the existing shared script — registering a domain applies
  to **all** wallet methods (subscriptions *and* these payments), so there is one
  registration, not one per flow:

  ```bash
  node --env-file=.env.local scripts/setup-stripe-apple-pay-domains.mjs            # register
  node --env-file=.env.local scripts/setup-stripe-apple-pay-domains.mjs --validate-only
  ```

  Registers `NEXT_PUBLIC_CANONICAL_APP_URL` / `NEXT_PUBLIC_APP_URL` hostnames
  (production only). For Axis: `www.axis-seattle-housing.com` (and the apex if you
  serve checkout there).

The **hosted** application-fee redirect renders on `checkout.stripe.com`, which
Stripe verifies itself — so Apple Pay there works even before our own domain is
registered. Our-domain registration is what unlocks the **embedded** rent
checkout wallet.

## Account-owner setup (one time, Stripe Dashboard — cannot be scripted here)

1. **Settings → Payment methods** — enable **Apple Pay** (and **Google Pay**).
2. Run `scripts/setup-stripe-apple-pay-domains.mjs` against the **live** account
   to register the production hostname(s), then `--validate-only` until Apple Pay
   reads `active`.
3. **Recommended:** create a **card-scoped** Payment Method Configuration
   (Apple Pay + Google Pay + Card, optionally Link, **no** ACH) and set
   `STRIPE_RESIDENT_CARD_PAYMENT_METHOD_CONFIGURATION=pmc_…` in the app env. This
   guarantees the wallets surface via dynamic payment methods while keeping the
   card-fee model exact. Without it, card sessions fall back to `["card"]`.

## Native iOS (Capacitor WKWebView) caveat

The iOS app loads the production site in a WKWebView. Apple Pay on the **web**
works in Safari immediately once the above is done. Apple Pay **inside the
WKWebView** can require the native shell to be entitled for Apple Pay on the web —
that is native build config and is **out of scope** for this change (a separate
iOS task owns native config). The hosted application-fee redirect and Safari web
paths are unaffected.

## Testing

| Environment | Apple Pay |
| --- | --- |
| `localhost` | Not available — use Stripe test card `4242…` |
| Safari macOS/iOS (HTTPS, domain registered) | Yes |
| Stripe test mode | Apple Pay test wallet in Safari |

1. Rent: `/resident/payments` → select a pending charge → **Card** method → the
   embedded Checkout shows the Apple Pay button above the card fields on eligible
   Safari/devices.
2. Application fee: `/rent/apply` → final fee step → the hosted Checkout shows
   Apple Pay for the card method.

## Related

- [`stripe-apple-pay-subscriptions.md`](stripe-apple-pay-subscriptions.md) — the
  subscription wallet flow (shared domain registration, PMC pattern).
- [`docs/agents/resident-payments.md`](agents/resident-payments.md) — fee model.
