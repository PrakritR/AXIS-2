> Moved out of AGENTS.md to keep every-session context lean. This file is the
> source of truth for its area — READ IT BEFORE changing code in this area.

# Apple In-App Purchase (iOS) — RevenueCat as a fifth `manager_purchases` grant source

The iOS app was rejected under **App Store Guideline 3.1.1**: the manager SaaS
plan the app unlocks was not purchasable via In-App Purchase. The fix is a real
StoreKit purchase path for the manager subscription, on **RevenueCat's Capacitor
SDK**, wired into the SAME entitlement spine Stripe/admin/waiver/trial already
share. Full background + captain decisions: `firstmate/data/ios-iap-plan/report.md`.

**Captain-decided parameters (do not re-litigate):** RevenueCat as client +
receipt validation + webhook layer; **absorb** pricing (same price as web, Apple
Small Business Program 15%); **Pro + Business, monthly only** at launch; the
14-day trial mirrors as an Apple intro offer; annual + any external-purchase
link are explicit non-goals for this pass (IAP-only at launch).

## The one rule: Apple is `billing = 'apple'`, extend — never rebuild

`manager_purchases` is already multi-source (`resolveManagerSubscriptionTierFrom
Purchase` in `src/lib/manager-access.ts` branches on Stripe / admin / waiver /
trial). Apple is the **fifth** source. An Apple-paid grant is:

- `billing = 'apple'` **AND** `apple_original_transaction_id` set (both required —
  a bare `billing='apple'` with no transaction anchor grants nothing). The
  predicate is `isAppleBilledManagerPurchase()` in `src/lib/manager-apple-purchase.ts`.
- `stripe_checkout_session_id = 'apple_iap_<originalTransactionId>'` (the column
  is UNIQUE NOT NULL; every non-Stripe grant synthesizes one).
- `rc_app_user_id = <our Supabase user.id>` — the RevenueCat App User ID. We
  `Purchases.logIn(user.id)` so an anonymous StoreKit purchase ties to the signed-in
  manager and cannot leak across accounts.

Columns added additively in `supabase/migrations/20260724120000_manager_purchases_apple_iap.sql`
(`apple_original_transaction_id`, `apple_environment`, `rc_app_user_id`). RLS is
unchanged — service-role only, written exclusively by the webhook/reconciler.

## ⚠️ The #1 landmine — the revoke sweep

`revokeUnauthorizedManagerPaidTier` (`src/lib/manager-tier-sync.ts`) runs on
**every entitlement read** and clears any paid tier not backed by Stripe/admin/
waiver/trial. Apple grants have **no Stripe subscription**, so without an explicit
whitelist the next page load silently downgrades a paying iOS customer to Free.
Both `revokeUnauthorizedManagerPaidTier` and `applyExpiredManagerPurchaseDowngrade`
now `return false` on `isAppleBilledManagerPurchase(...)`. Apple expiry is
**webhook-driven**, never `paid_at` date-math (the `apple` billing marker carries
no cadence). Regression coverage: `tests/unit/manager-tier-sync.test.ts`.

## Lifecycle: webhook is the real-time signal, reconciler is the safety net

`src/app/api/revenuecat/webhook/route.ts` verifies the RevenueCat
`Authorization` header constant-time against `REVENUECAT_WEBHOOK_AUTH_HEADER`,
then `applyRevenueCatWebhookEvent` maps the event to a grant/revoke/ignore via
the **pure** `interpretRevenueCatWebhookEvent` (`src/lib/manager-apple-webhook.ts`):

| Event | Action |
| --- | --- |
| INITIAL_PURCHASE / RENEWAL / PRODUCT_CHANGE / UNCANCELLATION / SUBSCRIPTION_EXTENDED | grant while coverage window (expiry or grace) is open |
| CANCELLATION (auto-renew off) | keep access until the period actually ends |
| BILLING_ISSUE (+ grace) | keep access while grace has not elapsed |
| EXPIRATION | revoke |
| CANCELLATION with `cancel_reason = CUSTOMER_SUPPORT` / REFUND | revoke immediately |
| TEST / TRANSFER / INVOICE_ISSUANCE / unknown product | ignore |

Safety discipline mirrors Stripe's `isDefinitiveStripeSubscriptionMissingError`:
**downgrade only on a definitive expiry/refund**, never on ambiguity. The handler
is idempotent (upsert/downgrade to a target state, not a delta), so RevenueCat's
at-least-once redelivery is safe; a real failure throws → 500 → RevenueCat retries.

`reconcileManagerPurchaseWithApple` (`src/lib/manager-apple-subscription-sync.ts`)
runs inside `syncManagerPurchaseTierState` (best-effort, after the Stripe
reconcile). It only fires for Apple-billed rows when `REVENUECAT_SECRET_API_KEY`
is set, fetches the authoritative RevenueCat subscriber, and downgrades ONLY on a
definitive HTTP-200 "no active managed subscription"; any non-200/network error
keeps the last known DB state.

## Double-subscribe (real money) — union, never lock out, never auto-cancel

A manager could pay Stripe (web) AND Apple (iOS). Rules (report §3.4):

- **Prevent in-app:** the native plan surface calls `/api/manager/subscription`
  first; if the account already has an active Stripe (or Apple) subscription it
  shows a manage-only notice and **never** offers a second purchase.
- **Prevent on web:** `appleManaged` is exposed on `/api/manager/subscription`;
  the web plan UI can hide Stripe checkout when an Apple sub is active.
- **If both exist anyway:** the account stays **paid** (union). `upsertAppleManager
  Purchase` on a row with a live Stripe subscription does NOT overwrite the
  Stripe tier — it only stamps the Apple ids and logs a dual-subscribe warning
  for support to refund the duplicate. `downgradeAppleManagerPurchase` on such a
  row clears only the Apple ids (Stripe still pays). **Never auto-cancel or
  auto-refund from code** — that is a support action.
- A stale EXPIRATION for a superseded `original_transaction_id` is ignored so an
  old event cannot wipe a fresh resubscribe.

## UI: native purchase surface, web untouched

`src/components/portal/manager-plan-native.tsx` replaces the old "managed outside
the app" `nativeNotice` in `manager-plan.tsx`. It renders ONLY inside the iOS
shell (`.native-only` + `isNative` self-guard); the web `.native-hide` plan path
is unchanged. It configures RevenueCat with `user.id`, fetches offerings
(localized App Store price), and offers Subscribe + **Restore purchases**
(required by App Review). Server entitlement is granted by the webhook, so the UI
polls `/api/manager/subscription` after a purchase/restore. Client wrapper:
`src/lib/native/revenuecat-client.ts` (lazy-imports `@revenuecat/purchases-capacitor`,
no-op off-iOS — same pattern as `push-client.ts`).

## Environment variables (NO secrets committed)

Add to `.env` locally and Vercel (and GitHub Actions for the native build):

| Var | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_REVENUECAT_IOS_API_KEY` | public (client) | Apple SDK key — can only start purchases; safe to expose |
| `REVENUECAT_SECRET_API_KEY` | server secret | RevenueCat REST v1 (reconciler CustomerInfo lookups) |
| `REVENUECAT_WEBHOOK_AUTH_HEADER` | server secret | shared value set as the RevenueCat webhook Authorization header; verified constant-time |

All three unset ⇒ IAP is dormant (client is a no-op, reconciler skips, webhook
returns 500 until configured); web/Stripe entitlement is completely unaffected.
`.env.example` is permission-blocked in this worktree — add the three keys there
too when unblocked.

## External setup still required (not code)

- **Paid Applications Agreement** Active (banking → "Clear" + tax + DSA trader
  status) — hard prerequisite; nothing sandbox-testable until signed.
- **App Store Connect products** (immutable ids): `com.axisseattlehousing.app.pro.monthly`,
  `com.axisseattlehousing.app.business.monthly`, in one auto-renewable subscription
  group, prices at web parity, Small Business Program enrolled, 14-day intro offer,
  billing grace enabled, review screenshot of the native purchase screen.
- **RevenueCat**: project + iOS app (App-Specific Shared Secret / In-App Purchase
  key), entitlements/products mapped to the ids above, webhook → `/api/revenuecat/webhook`
  with the Authorization value = `REVENUECAT_WEBHOOK_AUTH_HEADER`.
- **Native build**: `@revenuecat/purchases-capacitor` is in `package.json`; the
  iOS TestFlight workflow's `npx cap sync ios` integrates the native plugin. The
  plugin ships a CocoaPods podspec (dep `PurchasesHybridCommon`); verify it
  resolves under this project's SPM (`CapApp-SPM`) on the first `cap sync` — if
  not, pin a RevenueCat version with SPM support or add the pod.
