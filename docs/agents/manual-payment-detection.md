# Manual payment detection (Zelle / Venmo)

How PropLane decides a Zelle or Venmo charge is **paid** from the manager's
own payment-notification emails, and the setup a manager and resident each do.

The in-product setup UI is the source of truth managers actually use:
**Payments → Payment setup → Link Zelle / Link Venmo**
(`src/components/portal/manager-payment-setup-modal.tsx`). This doc is the
architecture reference behind it; keep the two in sync.

## The two detection paths

| Path | Trigger | Latency |
| --- | --- | --- |
| **Linked Gmail** | Manager taps **Sync now** (`POST /api/portal/gmail-payments/sync`) | On sync only — no automatic cron |
| **Forwarded email** (`payments+<token>@…`) | A Gmail filter forwards receipts; the inbound webhook processes each on arrival | Instant |

Both paths run the SAME parse → match → mark-paid pipeline
(`src/lib/payment-receipt-email/`). Only genuine receipts are trusted: the
sender host must be Venmo/Zelle (or an allow-listed bank for Zelle,
`BANK_RECEIPT_DOMAINS`) — a mere mention of "venmo"/"zelle" in the body from an
untrusted host is rejected.

## Matching — two tiers, biased to safety

A receipt is matched against the manager's **pending / failed / partially_paid**
charges. Amounts, identity, and the reference come only from the receipt; the
model never invents a match.

1. **Reference code (strong).** If the resident put the charge's
   `PL-XXXXXX` code in the memo, we match that exact code + amount. A code that
   resolves to nothing is `no_match` — never re-attributed by fuzzy fallback.
2. **Reference-less fallback (`receipt-fallback-match.ts`).** Real people write
   "Application fee for room 5 at 5257 Brooklyn avenue" with no code. We match on
   **amount + payer name + property/unit context**:
   - Payer name must share **first + last** with the resident on file.
   - Property match needs the **street number _and_ a distinctive word** from the
     listing label in the memo (a generic "avenue" alone never matches).
   - Auto-mark only when **exactly one** charge has the amount and a strong
     identity signal. Otherwise → **`ambiguous`**, surfaced for the manager to
     confirm. **Amount alone never auto-credits.** A wrong auto-credit is worse
     than leaving a charge pending.

**Idempotency:** the source email id is written onto the charge
(`paidViaGmailMessageId` / `paidViaEmailReceiptId`); re-processing the same
receipt returns `idempotent` and never double-credits, and one payment is
applied to at most one charge.

## Setup steps

### Manager (once per channel)
1. **Save your Zelle/Venmo contact** — residents see it on their payment screen.
2. **Turn on payment-received email notifications** in Zelle/your bank app or
   the Venmo app.
3. **Link Gmail** (read-only receipt scope) *or* set up a **forwarding filter**
   to `payments+<token>@prop-lane.space` for instant detection.
4. **Auto-mark charges paid** toggle — on by default.

### Resident (shown on the charge, resident Payments)
- Pay the manager's Zelle/Venmo contact for the exact amount.
- **Include the `PL-XXXXXX` code** shown on the charge in the memo/note — fastest,
  most reliable match. The resident Payments panel surfaces this code on every
  Zelle/Venmo charge (`chargePaymentReference`), copy-to-clipboard.
- No code? We still match from the payer's name + the property, but the code is
  fastest.

### Detection timing
- **Forwarded email:** matched the moment the receipt lands.
- **Linked Gmail:** matched when the manager taps **Sync now**.
- Anything we can't confidently attribute is surfaced as **ambiguous** for the
  manager to confirm, not silently credited.

## Tests
- `tests/unit/receipt-fallback-match.test.ts` — name/property/amount matching.
- `tests/unit/payment-receipt-email.test.ts` — parser incl. reference-less real
  Venmo shape + payer-name extraction.
- `tests/unit/mark-charge-from-receipt.test.ts` — end-to-end mark-paid from the
  real receipt shape, ambiguity, and idempotency (same receipt twice).
