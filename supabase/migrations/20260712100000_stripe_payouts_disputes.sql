-- Phase 2: Stripe Connect payout + dispute tracking (manager bank payouts).

create table if not exists public.stripe_payouts (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null references auth.users (id) on delete cascade,
  stripe_payout_id text not null,
  stripe_connect_account_id text not null,
  amount_cents bigint not null,
  currency text not null default 'usd',
  status text not null check (status in ('paid', 'pending', 'in_transit', 'failed', 'canceled')),
  arrival_date date,
  failure_message text,
  row_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists stripe_payouts_stripe_id_unique on public.stripe_payouts (stripe_payout_id);
create index if not exists stripe_payouts_manager_idx on public.stripe_payouts (manager_user_id, created_at desc);

create table if not exists public.stripe_disputes (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null references auth.users (id) on delete cascade,
  stripe_dispute_id text not null,
  stripe_charge_id text not null,
  amount_cents bigint not null,
  status text not null,
  reason text,
  source_charge_id text,
  row_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists stripe_disputes_stripe_id_unique on public.stripe_disputes (stripe_dispute_id);
create index if not exists stripe_disputes_manager_idx on public.stripe_disputes (manager_user_id, created_at desc);
create index if not exists stripe_disputes_charge_idx on public.stripe_disputes (stripe_charge_id);

alter table public.stripe_payouts enable row level security;
alter table public.stripe_disputes enable row level security;

create policy stripe_payouts_manager_read on public.stripe_payouts
  for select using (manager_user_id = auth.uid());

create policy stripe_disputes_manager_read on public.stripe_disputes
  for select using (manager_user_id = auth.uid());

alter table public.profiles
  add column if not exists stripe_connect_charges_enabled boolean,
  add column if not exists stripe_connect_payouts_enabled boolean;
