> Moved out of AGENTS.md to keep every-session context lean. This file is the
> source of truth for its area — READ IT BEFORE changing code in this area.

# Resident payments: face value on every method (PropLane absorbs processing) + clearing-window `processing` status

**Residents and applicants pay EXACTLY the subtotal — on card, Link, AND
bank/ACH — the manager still receives the full subtotal, and PropLane's own
Stripe balance bears the processing cost** (captain decision 2026-07-23,
superseding the earlier "resident pays processing" pass-through model, which
itself superseded "free ACH").

The mechanism is the arrangement, not an arithmetic offset. Every resident and
applicant payment is a Connect **destination charge** created on the PLATFORM
account (PropLane is merchant of record) with
`transfer_data.destination = <manager connected account>` and **no
`application_fee_amount`**. On a destination charge Stripe's fee is the
platform's liability by default, so with a 0 application fee the whole subtotal
transfers to the manager and PropLane is left net short by exactly Stripe's fee.
No path may use a direct charge / `on_behalf_of` / a `Stripe-Account` header for
these — that flips the fee liability onto the MANAGER.

`src/lib/payment-policy.ts` is the single source of truth and all three helpers
return `0`: `residentProcessingFeeCents`, `achProcessingFeeCents` (with its
deprecated `achPlatformRecoupCents` alias), and `residentConnectApplicationFeeCents`
(= processing + tier fee; the platform take rate is 0 bps on every tier).
`managerAbsorbedPaymentFeeCents()` is `0` too — nobody but PropLane pays.
The composition in `createAxisAchCheckoutSession` is kept generic on purpose: a
fee could never be retained without also being charged as its own disclosed line
item, and a runtime invariant (`totalCents - applicationFeeAmount === subtotalCents`)
throws before the session is created if that ever stops holding.

Coverage: `tests/unit/resident-processing-fees.test.ts` (policy math),
`tests/unit/stripe-axis-ach-checkout.test.ts` (the params actually sent to
Stripe: one line item at face value, no `application_fee_amount`,
`transfer_data` destination, no `on_behalf_of`), and
`tests/unit/stripe-ledger-fees.test.ts` (fee attribution).

**Ledger attribution: the Stripe fee is NOT the manager's.** `ledger_entries` is
the manager's book, so `enrichLedgerPaymentFromStripeCharge` writes
`stripe_fee_cents = 0` and `net_cents = charge.amount - application_fee` (the
destination transfer), rather than the platform balance transaction's fee/net.
PropLane's real cost lives in PropLane's own Stripe balance. Do not post a
`stripe_fee` GL entry against a manager — nothing left their payout.

**Every pre-Stripe confirmation states the exact total and that there are no
added fees.** Any surface that names an amount before handing off to Stripe
shows the total due plus "no added fees" / "PropLane covers payment processing"
— never a processing-fee line. A QA sweep (2026-07-21) under the old model found
the "Continue to Stripe?" dialog understating a card payment by $515.96; the fix
then, and the rule now, is to derive the disclosure from
`residentProcessingFeeCents` / `residentProcessingFeeDisplayLabel` rather than
re-deriving the amount, so it can never drift from what checkout collects.

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
