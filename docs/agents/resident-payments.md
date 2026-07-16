> Moved out of AGENTS.md to keep every-session context lean. This file is the
> source of truth for its area — READ IT BEFORE changing code in this area.

# Resident payments: free ACH + clearing-window `processing` status

Bank (ACH) rent payments are **free to the resident** — no pass-through line
item. Stripe's real ACH cost (0.8% capped at $5) is recouped from the manager's
Connect payout via `achPlatformRecoupCents` (`src/lib/payment-policy.ts`), used
as the session's `application_fee_amount`. Card/Link keep their 2.9% + $0.30
resident pass-through. Do NOT reintroduce a resident-facing ACH fee.

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
