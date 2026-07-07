-- Fee/net tracking columns on ledger_entries (Phase 0 of the financials
-- buildout). Populated later by Phase 2's Stripe webhook completeness work —
-- nullable and unused by this migration's own changes.
--
-- Deliberately NOT adding gl_journal_entry_id here (the plan draft lists it
-- alongside these columns): gl_journal_entries doesn't exist until Phase 1,
-- so that column would be a dangling FK today. Add it in the Phase 1
-- migration instead.

alter table public.ledger_entries
  add column if not exists stripe_fee_cents bigint,
  add column if not exists axis_fee_cents bigint,
  add column if not exists net_cents bigint,
  add column if not exists stripe_charge_id text,
  add column if not exists stripe_transfer_id text,
  add column if not exists stripe_payout_id text;

alter table public.ledger_entries
  drop constraint if exists ledger_entries_entry_type_check;
alter table public.ledger_entries
  add constraint ledger_entries_entry_type_check
  check (entry_type in ('charge', 'payment', 'refund', 'adjustment'));

create index if not exists ledger_entries_stripe_charge_id_idx
  on public.ledger_entries (stripe_charge_id) where stripe_charge_id is not null;
create index if not exists ledger_entries_stripe_payout_id_idx
  on public.ledger_entries (stripe_payout_id) where stripe_payout_id is not null;
