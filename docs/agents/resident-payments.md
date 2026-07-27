> Moved out of AGENTS.md to keep every-session context lean. This file is the
> source of truth for its area — READ IT BEFORE changing code in this area.

# Resident payments: who pays the service fee depends on the manager's plan + clearing-window `processing` status

**The service fee (Stripe's real per-method processing cost) is paid by
different parties depending on the manager's plan** (captain decision
2026-07-26, superseding the 2026-07-23 "face value on every tier, PropLane
absorbs" model):

| Manager plan | Who pays the service fee |
| --- | --- |
| **Free** | The **resident** — added on top of what they pay. Always. |
| **Pro** | The **manager chooses** — resident pays, or the manager absorbs it. Per-manager, default **resident**. |
| **Business** | **PropLane absorbs** it — neither resident nor manager is charged (the old "face value" behavior). |

**The money still lands in the manager's own connected account.** Every resident
payment stays a Connect **destination charge** on the PLATFORM account
(`transfer_data.destination = <manager connected account>`, **never** a direct
charge / `on_behalf_of` / a `Stripe-Account` header). Only who bears the fee
moves, via `application_fee_amount`:

| Fee payer | Resident charged | `application_fee_amount` | Manager receives | PropLane net |
| --- | --- | --- | --- | --- |
| resident (Free, Pro-resident) | subtotal + fee | fee | subtotal | ≈ 0 |
| manager (Pro-manager) | subtotal | fee | subtotal − fee | ≈ 0 |
| proplane (Business) | subtotal | omitted | subtotal | − Stripe's fee |

`src/lib/payment-policy.ts` is the single source of truth:
- `residentProcessingFeeCents(subtotal, method)` — Stripe's cost (ACH 0.8% cap
  $5; card/Link 2.9% + $0.30). A pass-through, never a markup.
- `resolveServiceFeePayer(tier, proChoice)` — the plan rule above. `tier` is the
  normalized SKU tier (`normalizeManagerSkuTier(...) ?? "free"`), so a
  legacy/unknown tier resolves to `resident`.
- `residentServiceFeeBreakdown(subtotal, method, feePayer)` — how the fee lands
  (resident total, retained `application_fee_amount`, manager payout). The
  checkout builder and every disclosure derive from this, holding the invariant
  `totalCents − applicationFeeCents === managerPayoutCents` in all three cases;
  `createAxisAchCheckoutSession` throws before creating the session if it ever
  fails, and adds the resident fee line item ONLY when the resident pays.

The **Pro choice** is `serviceFeePayer: "resident" | "manager"` on
`ManagerManualPaymentSettings` (default `resident`), edited in the manager
Payment setup modal (Pro-only) and read live at charge time in
`stripe-household-charge-checkout.server.ts` — a plan change or toggle flip takes
effect on the next charge with no per-charge state. A resident learns their
manager's fee-payer for pre-checkout disclosure via
`GET /api/portal/resident-service-fee`
(`getManagerServiceFeePayerByManagerId`, scoped to their own
`profiles.manager_id`).

**The rental application fee follows the SAME plan-based rule** (captain
decision, 2026-07-26, superseding the earlier "out of scope, always face
value" carve-out): `/api/stripe/application-fee-checkout`
(`src/lib/application-fee-checkout.server.ts`) resolves `feePayer` from
`resolveServiceFeePayer` + the manager's `loadManagerManualPaymentSettings`,
exactly like a household charge — Free applicants pay the fee, Pro follows the
manager's choice, Business is absorbed by PropLane. The listing page itself
still shows only the application fee (no plan tier leaks there); the itemized
service fee only appears once an applicant reaches the payment step
(`/api/public/application-fee-preview` returns the same breakdown the checkout
route will charge, so the wizard can itemize before redirecting to Stripe).
**A manager-owned waiver code (`src/lib/application-fee-waiver.ts`,
`/api/public/application-fee-waiver`) can waive the application fee entirely**
— a redeemed code skips Stripe altogether (no $0 charge, no session).

## When the holding deposit is collected is the MANAGER'S CHOICE, per listing

(Captain decision, phase 2, 2026-07-26 — supersedes the phase-1 "holding
deposit is never collected during the application" rule below it. That
unconditional removal is NOT reverted in code — `at_application` re-enables
exactly what phase 1 turned off, `after_approval` is the phase-1 behavior
verbatim, and it is the default.)

`ManagerListingSubmissionV1.holdingDepositTiming: "at_application" |
"after_approval"` (`src/lib/manager-listing-submission.ts`), edited per-listing
in the manager Add/Edit listing form's Application & Holding card
(`manager-add-listing-form.tsx`). **Default `"after_approval"` for every
listing that has never set it** — normalization
(`normalizeManagerListingSubmissionV1`) coerces anything other than the literal
string `"at_application"` to `"after_approval"`, so a legacy listing, a typo,
or a stripped field all fail safe to the old behavior rather than surprising a
manager with a new upfront charge they never opted into.

| Timing | Behavior |
| --- | --- |
| `after_approval` (default) | Identical to phase 1: nothing deposit-related during the application. The applicant pays only the application fee (if any, subject to plan + waiver). The deposit is generated under Payments at approval, same as security deposits already were. |
| `at_application` | The holding deposit is folded into the SAME application-fee payment as ONE combined charge — e.g. $50 fee + $100 deposit = $150 — itemized for the applicant before they pay. |

**The combined charge is one Stripe Checkout session with two line items**
(`createApplicationFeeCheckout` in `application-fee-checkout.server.ts`), never
two separate charges: `Rental application fee` + `Holding deposit`, with
`metadata.includes_holding_deposit = "true"` / `holding_deposit_cents` so the
webhook (`/api/stripe/webhook`) and the ACH-return route
(`/api/stripe/application-fee-verify`) both mark the FEE charge paid via
`markApplicationFeePaidFromStripeSession` AND the DEPOSIT charge paid via the
sibling `markApplicationDepositPaidFromStripeSession` (a no-op — returns
`{ok:false}` — on any session that did not combine a deposit, so it is always
safe to call unconditionally after the fee marker). The plan-based service fee
(see the table above) is computed on the COMBINED base
(`resolveApplicationFeeItemization(..., holdingDepositCents)`), never on the
fee alone while a deposit rides for free. The manual (Zelle/Venmo/other)
channel gets the same combined requirement —
`checkApplicationFeeManualPayment` (`resident-check-manual-payment.server.ts`)
ensures AND requires both the fee and deposit charge rows paid before
reporting success, sharing one listing fetch (`loadListingForProperty`)
between the two ensure paths.

**A manager waiver code waives ONLY the fee, never the deposit** — it is an
"application fee waiver code" by name and by table
(`application_fee_waiver_codes`). On an `at_application` listing, a redeemed
code drops the fee line item entirely and the applicant still pays the
deposit alone in the SAME Stripe session
(`createApplicationFeeCheckout({ feeWaived: true, ... })`); on manual, the fee
ensure/require calls are skipped (`feeOwed = !feeWaived`) but the deposit
ensure/require calls still run. If there is truly nothing left to charge (fee
waived, listing is `after_approval` or has no deposit configured), checkout is
refused with `code: "NOTHING_DUE"` rather than opening a $0 session. The
applicant-facing waiver UI is a named **"Fee waive promotion"** card in the
wizard (not a buried field), gated on `amount > 0 && !codeWaived && !feePaid`
so it disappears once the fee itself is satisfied even if a deposit still
stands.

**`residentApplicationFeeGate` (`src/lib/rental-application/application-policy.ts`)
is the single deposit-aware gate** both the wizard and the checkout call sites
key off: `depositAmount` / `depositAtApplication` / `totalDue` describe the
deposit leg, `feePaid` is true once the FEE specifically no longer needs
paying (not owed, waived, or already paid) independent of the deposit, and
`paid`/`needsFee` require BOTH legs settled. A `feeWaivedByCode` param lets a
redeemed code zero the fee in the gate without the deposit ever reading as
satisfied by proxy.

**Flagged for the captain, not decided in code** — a `holding_deposit` charge
already paid at application is NEVER auto-refunded when the application is
later rejected or withdrawn. Whether it should be refunded (and under what
terms) is a legal/lease-terms question, not an engineering one, so no refund
flow was built. The manager Applications detail view shows a read-only reminder
banner ("Holding deposit already paid ($X)... PropLane does not automatically
refund it") on a rejected/withdrawn row with a paid deposit charge
(`manager-applications.tsx`, `data-attr="application-paid-deposit-note"`) so
the obligation is visible, but resolving it is manual and outside PropLane.

**"Implement a quality system" (captain's phase-2 instruction) was read as a
general bar for polish/clarity/robustness on this feature** — itemized
disclosure before every payment, no silent state (a `NOTHING_DUE` refusal
instead of a $0 Stripe session), fail-safe defaults on bad/legacy data, and
test coverage for the new combined-charge and waiver-scoped-to-fee paths —
NOT a specific new feature (e.g. no "application quality score" was built).
Flagged here in case the captain meant something more specific.

Coverage: `tests/unit/manager-listing-submission.test.ts` (`holdingDepositTiming`
default + normalization), `tests/unit/application-policy.test.ts` (deposit-aware
gate: combined `totalDue`, fee-waived-but-deposit-still-owed, `feePaid` vs
`paid`), `tests/unit/application-fee-checkout-fee-payer.test.ts` (combined
Stripe line items, `feeWaived`-drops-fee-not-deposit, `NOTHING_DUE` refusal),
`tests/unit/stripe-application-fee.test.ts` (`markApplicationDepositPaidFromStripeSession`),
`tests/unit/application-fee-verify-route.test.ts` (ACH-return path marks both
legs), `tests/unit/application-fee-preview-route.test.ts` (itemized preview
reflects combined/waived state), and
`tests/unit/resident-check-manual-payment.test.ts` (manual channel requires
both legs paid, skips the fee when waived).

### Phase 1 behavior (superseded above, kept here for the historical default)

The holding deposit used to be tracked as a pending `holding_deposit`
household charge the moment an applicant paid (or submitted) the application
fee, credited later against the security deposit at approval. That
pre-approval tracking was removed (`recordApplicationCharges` /
`recordSubmittedApplicationFeeCharge` no longer called
`ensurePendingHoldingDepositCharge` unconditionally) — any deposit money was
charged under Payments, after approval, same as security deposits already
were. Phase 2 re-adds a conditional call site
(`sub.holdingDepositTiming === "at_application"`) rather than reverting this —
`after_approval` listings still never call it during the application.

Coverage (application fee + waiver codes): `tests/unit/application-fee-checkout-fee-payer.test.ts`
(Connect destination, ownership guard, server-stored fee amount, plan-based
itemization) and `tests/unit/application-fee-waiver.test.ts` (code CRUD,
manager scoping, and the cross-manager-isolation + expiry/usage-cap redemption
guards).

Coverage: `tests/unit/resident-processing-fees.test.ts` (fee amounts, resolver,
breakdown, acceptance table), `tests/unit/service-fee-by-plan.test.ts` (settings
normalization + plan transitions), `tests/unit/stripe-axis-ach-checkout.test.ts`
(the params actually sent to Stripe for each fee-payer: line items,
`application_fee_amount`, `transfer_data` destination, no `on_behalf_of`), and
`tests/unit/stripe-ledger-fees.test.ts` (fee attribution).

**The destination is per-manager and the gate has NO platform fallback.** The
`transfer_data.destination` is resolved from the paying charge's owning manager
via `resolveAndValidateManagerConnectForPayments` (`src/lib/stripe-connect.ts`),
which reads that manager's own `profiles.stripe_connect_account_id`. If the
manager has not onboarded (no account) or Stripe reports transfers not yet active
(onboarding incomplete), the checkout is REFUSED
(`MANAGER_NO_CONNECT_ACCOUNT` / `MANAGER_CONNECT_TRANSFERS_NOT_READY`) before any
session is created — a charge is never silently routed to the platform account.
This holds for both household charges (`stripe-household-charge-checkout.server.ts`)
and application fees (`api/stripe/application-fee-checkout/route.ts`). Manager
Payment setup shows "Connected" ONLY when Stripe reports the account can actually
receive money; an existing-but-unfinished account reads as "incomplete"
(`src/lib/stripe-setup-state.ts`). Coverage:
`tests/unit/manager-connect-destination-routing.test.ts` (per-manager destination
isolation + the no-onboard block, real resolver against a fake DB),
`tests/unit/stripe-connect.test.ts` (the resolver gate), and
`tests/unit/stripe-setup-state.test.ts` (the UI truth mapping).

**Ledger attribution: the Stripe fee is NOT the manager's.** `ledger_entries` is
the manager's book, so `enrichLedgerPaymentFromStripeCharge` writes
`stripe_fee_cents = 0` and `net_cents = charge.amount - application_fee` (the
destination transfer), rather than the platform balance transaction's fee/net.
PropLane's real cost lives in PropLane's own Stripe balance. Do not post a
`stripe_fee` GL entry against a manager — nothing left their payout.

**Every pre-Stripe confirmation states the exact total, itemizing any service
fee the resident pays.** The resident payments panel resolves its manager's
fee-payer once (`/api/portal/resident-service-fee`) and, when the resident pays,
itemizes the fee in BOTH the "Continue to Stripe?" confirm dialog and the
embedded-checkout breakdown — computed from `residentProcessingFeeCents` /
`residentProcessingFeeDisplayLabel`, the SAME functions checkout uses, so the
disclosure can never understate what Stripe collects (a QA sweep on 2026-07-21
caught the confirm dialog understating a card payment by $515.96; deriving the
disclosure rather than re-deriving the amount is what prevents that). When the
manager or PropLane covers the fee, the resident pays face value and the surface
shows "no added fees". NEVER hard-code "$0.00 added fees" — that lies to a Free /
Pro-resident resident who does pay one.

While an ACH debit clears (3–5 business days) the charge status is
`"processing"` (persisted by the webhook's `checkout.session.completed`
unpaid branch and the verify route). Everything that keys on
`status === "pending"` — late fees, payment reminders, re-pay, overdue —
automatically ignores it. `async_payment_succeeded` → paid;
`async_payment_failed` reverts processing→pending (NSF/`failed` belong to the
`payment_intent.payment_failed` handler only — never double-fee).

Alternate flat-cents rails (Plaid Transfer / Dwolla / Moov, ~$0.25/transfer)
only beat Stripe above ~1,000 payments/month once monthly minimums are counted
— re-evaluate at that scale, not before.

# Resident Payments section: Charges-only (§9.3, post-financials-merge)

**Payments is Charges-only.** There are no URL sub-tabs and no `TabNav` switcher: the section is one screen at the bare `/resident/payments`, rendered by `ResidentPaymentsPanel` (the former `ResidentFinancialsPanel` was merged into it, then its Summary + Statements views were removed from the resident portal). The panel takes only `initialStatus` — the `tabId`/`basePath` props existed solely to serve those tabs and are gone, in `demo-section-renderer.tsx` too. `PAYMENTS_TABS` no longer exists; both resident section registries in `resident-sections.ts` declare `tabs: []`, so the sidebar links straight to `/resident/payments`.

Pending / Overdue / Paid are in-section status pills, not tabs. `RESIDENT_PAYMENTS_LEGACY_TABS` is a `{ status?: string }` map of every old sub-path (`charges`, `summary`, `statements`, `balance`, `pending`, `overdue`, `paid`); `renderPortalSection` redirects all of them to `/resident/payments`, preserving `?status=` for the three that map to a pill (forwarded as the panel's `initialStatus`). `/resident/financials/*` redirects the same way. The map is a **null-prototype** object so inherited `Object.prototype` keys (`toString`, `constructor`, `__proto__`, `hasOwnProperty`) do not read as known tabs — unknown sub-paths still `notFound()`. See AGENTS.md "Financials UI cleanup" for the routing gotchas, and `tests/unit/resident-payments-charges-only.test.ts` for the regression coverage on the empty `tabs`, the bare smoke path, and the legacy map (including the prototype-key case).

`/api/reports/resident-ledger` is live (resident Documents → Rent receipts).
