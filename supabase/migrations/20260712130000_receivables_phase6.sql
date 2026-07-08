-- Financials Phase 6: receivables completeness (billing settings, payment plans, waivers).

create table if not exists public.manager_billing_settings (
  manager_user_id uuid primary key references auth.users (id) on delete cascade,
  row_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.manager_payment_plans (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null references auth.users (id) on delete cascade,
  resident_user_id uuid references auth.users (id) on delete set null,
  resident_email text not null,
  property_id text,
  source_charge_id text not null,
  total_cents bigint not null check (total_cents > 0),
  installment_cents bigint not null check (installment_cents > 0),
  installments_total integer not null check (installments_total > 0),
  installments_paid integer not null default 0 check (installments_paid >= 0),
  next_due_date date,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists manager_payment_plans_manager_idx on public.manager_payment_plans (manager_user_id, status);

create table if not exists public.manager_late_fee_waivers (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null references auth.users (id) on delete cascade,
  source_charge_id text not null,
  waived_by uuid not null references auth.users (id) on delete cascade,
  reason text not null default '',
  amount_cents bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists manager_late_fee_waivers_charge_idx on public.manager_late_fee_waivers (manager_user_id, source_charge_id);

alter table public.manager_billing_settings enable row level security;
alter table public.manager_payment_plans enable row level security;
alter table public.manager_late_fee_waivers enable row level security;

drop policy if exists manager_billing_settings_owner on public.manager_billing_settings;
create policy manager_billing_settings_owner on public.manager_billing_settings
  for all using (manager_user_id = auth.uid());

drop policy if exists manager_payment_plans_owner on public.manager_payment_plans;
create policy manager_payment_plans_owner on public.manager_payment_plans
  for all using (manager_user_id = auth.uid());

drop policy if exists manager_late_fee_waivers_owner on public.manager_late_fee_waivers;
create policy manager_late_fee_waivers_owner on public.manager_late_fee_waivers
  for all using (manager_user_id = auth.uid());
