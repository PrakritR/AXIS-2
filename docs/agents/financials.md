> Moved out of AGENTS.md to keep every-session context lean. This file is the
> source of truth for its area — READ IT BEFORE changing code in this area.

# Financials Phase 0: chart of accounts + write-through ledger

**`public.chart_of_accounts` is the runtime source of truth for account
labels/Schedule E lookups** (`src/lib/reports/chart-of-accounts-store.ts`,
seeded/extended in `supabase/migrations/20260710090000_chart_of_accounts_double_entry.sql`
with account numbers, `normal_balance`, asset/liability/equity types, and trust-bank
placeholders). `SYSTEM_CHART_ACCOUNTS` in `src/lib/reports/categories.ts` is a
defense-in-depth fallback (used when the DB read fails) plus the source for the
income/expense dropdown pickers — never add a code to one without the other.
Report-query functions that loop rows calling `chartAccountLabel`/`chartAccountScheduleE`
must `await primeSystemChartOfAccounts(db)` once up top; the store caches with a 5-min TTL.

**The ledger is write-through only — there is no read-time backfill.** The old
per-request `?backfill=1` repair pass on every report load was removed (it re-scanned
up to 2000 charges per page view — the exact Supabase-egress problem this file warns
about). Every server-side path that creates a charge or marks one paid MUST call
`syncLedgerChargeEntry`/`syncLedgerPaymentEntry` (`src/lib/reports/ledger-sync.ts`)
next to the DB write, or the row silently never reaches reports. Current call sites:
`/api/portal-household-charges` (client mirror upsert — via the batched
`syncDedupedCharges` wrapper), the late-fee creation in
`/api/cron/send-payment-reminders`, `stripe-household-charge.ts`, and
`stripe-application-fee.ts` — copy that pattern for any new charge-mutation route.
The Stripe paid paths are self-healing: `markHouseholdChargePaidFromStripeSession`
and `markApplicationFeePaidFromStripeSession` re-run `syncLedgerPaymentEntry` even
on their already-paid short-circuit (best-effort — a failure is logged, never
thrown), so a success-page retry or webhook redelivery repairs a ledger row whose
first sync failed transiently. Phase 2 webhook work builds on these paths — keep
that idempotent re-sync in place. Re-syncs rebuild the ledger row from the charge,
which usually carries no session id, so both update paths (`upsertLedgerEntryRow`
and the batched `syncDedupedCharges`) coalesce `stripe_checkout_session_id` to the
already-stored value — never let a re-sync blank it; it is the only link back to
the Stripe Checkout session that settled the payment
(regression coverage: `tests/unit/reports/ledger-sync.test.ts`).
The batched sweep logic (`backfillLedgerFromCharges` in `ledger-sync.ts`) still exists,
but only as an explicit, admin-gated, one-time historical repair — it is invoked solely
via `POST /api/admin/backfill-ledger` (optionally scoped to one `managerUserId` in the
body, which must be a uuid — anything else is rejected with 400), never from a report
route or page load. Run it once per environment after
deploying write-through sync to mirror any charge history that predates it.

**`security_deposit` charges book to `security_deposit_liability` (a liability), not
income**; `move_in_fee` stays income (non-refundable). The `nsf_fee` charge kind exists
in types/mappings only — nothing creates it until the Stripe-webhook phase. The deposit
liability sub-ledger, GL posting, and historical reclassification are Phase 3
(`/Users/prakrit/.claude/plans/idempotent-seeking-hopcroft.md` §1.8/§5) — Phase 0 only
stops new deposits from miscategorizing. `queryIncomeStatement` still sums all payment
ledger entries, so a paid deposit shows as a visible "Security Deposits Held" line until
Phase 3 excludes non-income accounts properly.

# Financials Phase 1: double-entry GL

**Additive layer on top of `ledger_entries` / `manager_expense_entries`** — existing income-statement/delinquency queries are unchanged; Balance Sheet / Trial Balance / General Ledger read the new GL tables.

**Schema** — `supabase/migrations/20260712090000_gl_journal.sql`: `gl_journal_entries` (source_type + source_id idempotency key) + `gl_journal_lines` (account_code, debit_cents, credit_cents). `ledger_entries.gl_journal_entry_id` links cash-event rows to their journal.

**Posting** — `src/lib/reports/gl-posting.ts`: idempotent `postGlChargeEntry` (DR AR / CR income or liability), `postGlPaymentEntry` (DR operating or trust cash / CR AR), `postGlExpenseEntry` (DR expense / CR operating cash). Wired next to `syncLedgerChargeEntry`/`syncLedgerPaymentEntry` in `ledger-sync.ts`, `/api/expenses` POST, and `createExpensesFromWorkOrder`.

**Reports** — `src/lib/reports/queries/gl-reports.ts`: `queryTrialBalance`, `queryBalanceSheet`, `queryGeneralLedger`, `queryCashFlowStatement` (simplified bank-account view). Registered in `MANAGER_REPORT_IDS`, `runManagerReport`, Finances portal tabs, and `run_financial_report` AI tool.

**Historical repair** — `POST /api/admin/backfill-gl` (admin-gated) sweeps existing ledger + expense rows through the posting service once per environment; never on page load.

**Deploy:** `npm run db:push` for `gl_journal_*` tables before GL posting will succeed in dev/staging/production.

# Financials Phase 2: Stripe webhook completeness

**Schema** — `supabase/migrations/20260712100000_stripe_payouts_disputes.sql`: `stripe_payouts` (Connect bank payouts), `stripe_disputes`, plus `profiles.stripe_connect_charges_enabled` / `stripe_connect_payouts_enabled` cache.

**Ledger fee capture** — `src/lib/stripe-ledger-fees.ts` populates `stripe_fee_cents`, `net_cents`, `axis_fee_cents`, `stripe_charge_id` on payment ledger rows after checkout (balance transaction fetch).

**Webhook handlers** — `src/lib/stripe-webhook-financials.ts` + extended `src/app/api/stripe/webhook/route.ts`:
- `account.updated` → Connect readiness on profiles
- `transfer.created` → `stripe_transfer_id` / `net_cents` on ledger
- `payout.paid` / `payout.failed` / `payout.canceled` → `stripe_payouts` (resolves manager via `profiles.stripe_connect_account_id`)
- `charge.refunded` / `refund.*` → refund ledger row + `postGlRefundEntry`
- `charge.dispute.*` → `stripe_disputes`
- `payment_intent.payment_failed` → metadata on charge row (does not change `HouseholdCharge.status` — NSF fee status is Phase 6)

**Reports** — `queryPayoutHistory` in `gl-reports.ts`; Finances **Payout history** tab + `run_financial_report` tool.

**Stripe Dashboard:** add events `transfer.created`, `payout.*`, `charge.refunded`, `refund.*`, `charge.dispute.*`, `payment_intent.payment_failed` to the webhook destination alongside existing checkout/subscription events.

# Financials Phase 3: security deposit trust sub-ledger

**Schema** — `supabase/migrations/20260712110000_security_deposit_trust.sql`: `security_deposit_ledger` (per-deposit sub-ledger with disposition status/itemization), `manager_bank_accounts` / `manager_bank_statements` / `manager_bank_statement_lines` (reconciliation foundation), `manager_reclassification_log` (audit).

**Lib** — `src/lib/reports/security-deposits.ts`: `receiveSecurityDeposit()` (hooked from `syncLedgerPaymentEntry` on paid `security_deposit` charges), `disposeSecurityDeposit()` (move-out refund/withhold + GL), `reclassifyMisclassifiedDeposits()` (dry-run + opt-in historical fix from `other_income` → liability).

**GL** — `postGlDepositDisposition` / `postGlReclassifyDeposit` in `gl-posting.ts` (`deposit_refund` / `adjustment` source types).

**API** — `POST /api/reports/security-deposits/reclassify` (`dryRun` default true), `GET /api/security-deposits`, `POST /api/security-deposits/[id]/dispose`.

**Reports** — `queryTrustAccountBalance` (three-way bank = GL trust cash = GL liability = sub-ledger), `queryFinancialDiagnostics` (unbalanced journals, trust mismatch, misclassified deposits, expired insurance). Finances tabs **Trust account** + **Diagnostics**. Income statement excludes non-income ledger categories (deposits no longer inflate rental income).

**PostHog:** `security_deposit_disposed`, `security_deposit_reclassification_run` (server).

**Deploy:** `npm run db:push` for `security_deposit_ledger` + bank tables before sub-ledger writes succeed.

# Financials Phase 5: AP bills, budgets, owner statements

**Schema** — `supabase/migrations/20260712120000_manager_bills_ap.sql`: `manager_bills`, `manager_budgets`, `manager_property_owners`, `manager_reserve_policies`, `manager_owner_distributions`; `vendor_invoices.bill_id` FK to `manager_bills`.

**Lib** — `src/lib/manager-bills.ts` + `manager-bills.server.ts`: create/approve/pay bills (paid bills write `manager_expense_entries` + GL), `createBillFromVendorInvoice` on invoice approve.

**GL** — `postGlBillApproved` (DR expense / CR AP), `postGlBillPaid` (DR AP / CR cash) in `gl-posting.ts`.

**API** — `GET/POST /api/manager-bills`, `PATCH /api/manager-bills/[id]` (`approve`/`pay`/`void`).

**Reports** — `queryApAging`, `queryBudgetVsActual`, `queryOwnerStatement` in `ap-reports.ts`; Finances tabs **AP aging**, **Budget**, **Owner statement**.

**PostHog:** `bill_created`, `bill_approved`, `bill_paid` (server).

# Financials Phase 6: receivables completeness

**Schema** — `supabase/migrations/20260712130000_receivables_phase6.sql`: `manager_billing_settings`, `manager_payment_plans`, `manager_late_fee_waivers`.

**Charge status** — `HouseholdCharge.status` extended: `pending|partially_paid|paid|cancelled|refunded|failed` + optional `paidAmountCents`; `applyPartialPaymentCents` in `nsf-fees.ts`.

**NSF** — `payment_intent.payment_failed` webhook marks charge `failed` and `createNsfFeeForFailedPayment` when `manager_billing_settings.nsfFeeEnabled` (default $35).

**Settings** — `src/lib/manager-billing-settings.ts` (`paymentApplicationOrder`, NSF toggle/amount).

**Deploy:** `npm run db:push` for Phase 5+6 tables before bill/NSF paths succeed.
