> Moved out of AGENTS.md to keep every-session context lean. This file is the
> source of truth for its area — READ IT BEFORE changing code in this area.

# Resident payments: resident-paid processing on every method + clearing-window `processing` status

**The resident always pays the payment processing/service fee — on card, Link,
AND bank/ACH — so the manager receives the full charge amount on every method**
(captain decision 2026-07, superseding the earlier "free ACH" model). The fee is
added on top of the charge as a visible service-fee line item and recovered from
the checkout total via the Connect `application_fee_amount`, so the manager's
payout equals the subtotal regardless of method.

Per-method resident processing fee (`residentProcessingFeeCents`,
`src/lib/payment-policy.ts`): bank/ACH = Stripe's real cost **0.8% capped at $5**
(`achProcessingFeeCents`, also exported as the deprecated alias
`achPlatformRecoupCents`); card/Link = **2.9% + $0.30**. `residentConnectApplicationFeeCents`
= processing + tier fee for the chosen method, and is set as the session
`application_fee_amount`; `managerAbsorbedPaymentFeeCents()` is `0` on every
method by construction. Never charge more than Stripe's real cost, and never
route a Stripe fee back onto the manager's payout. (ACH fee math and the
"manager kept whole on every method" invariant are locked by
`tests/unit/resident-processing-fees.test.ts`.)

**Every pre-Stripe confirmation MUST disclose the fee and the real total.**
Because the resident pays the processing fee on top of the subtotal, any surface
that states an amount before handing off to Stripe has to show the processing
fee line and the resulting total due — not the bare sum of charge balances.
A QA sweep (2026-07-21) found the resident Payments "Continue to Stripe?" dialog
showing only the subtotal, understating a $17,781.61 card payment by $515.96.
When adding a new pay entry point, derive the disclosure from
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

# Resident payments + financials merge (§9.3)

**Payments** section uses URL tabs: `pending`, `paid`, `balance`, `statements` (`PAYMENTS_TABS` in `resident-sections.ts`). Balance/statements render `ResidentFinancialsPanel`; `/resident/financials` redirects to `/resident/payments/pending`.
