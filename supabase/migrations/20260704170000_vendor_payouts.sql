-- Vendor payout ledger: one row per work order paid out via Stripe Connect transfer
-- (or a recorded failure/skip when the vendor hasn't finished Connect onboarding).
create table if not exists public.vendor_payouts (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null references auth.users (id) on delete cascade,
  vendor_user_id uuid not null references auth.users (id) on delete cascade,
  work_order_id text not null,
  amount_cents integer not null,
  stripe_transfer_id text,
  status text not null check (status in ('paid', 'failed', 'skipped')),
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vendor_payouts_work_order_unique on public.vendor_payouts (work_order_id);
create index if not exists vendor_payouts_vendor_user_id_idx on public.vendor_payouts (vendor_user_id);
create index if not exists vendor_payouts_manager_user_id_idx on public.vendor_payouts (manager_user_id);

alter table public.vendor_payouts enable row level security;

-- Defense-in-depth only — all writes go through the service-role approve-pay route.
create policy vendor_payouts_vendor_read on public.vendor_payouts
  for select using (vendor_user_id = auth.uid());

create policy vendor_payouts_manager_read on public.vendor_payouts
  for select using (manager_user_id = auth.uid());
