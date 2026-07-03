-- Idempotency key for expenses auto-created from a Stripe payment event
-- (Checkr screening charge, subscription invoice paid) so webhook retries
-- or duplicate calls upsert onto the same row instead of duplicating it.
alter table public.manager_expense_entries
  add column if not exists source_stripe_payment_id text;

-- Plain (non-partial) unique index: Postgres treats NULLs as distinct, so
-- manual expense rows (source_stripe_payment_id null) are unaffected, while
-- PostgREST's upsert(onConflict: "...") can target this index directly —
-- ON CONFLICT can't infer a partial index without a matching insert WHERE.
create unique index if not exists manager_expense_entries_stripe_payment_idx
  on public.manager_expense_entries (manager_user_id, source_stripe_payment_id);
