-- Allow a "pending" vendor_payouts status: the payout code now inserts a claim row
-- (status "pending") BEFORE calling Stripe, using the unique index on work_order_id as the
-- concurrency gate against double-transfers, then updates the row to "paid"/"failed" once the
-- Stripe call resolves. Idempotent: drops and recreates the check constraint.
alter table public.vendor_payouts drop constraint if exists vendor_payouts_status_check;
alter table public.vendor_payouts add constraint vendor_payouts_status_check
  check (status in ('pending', 'paid', 'failed', 'skipped'));
