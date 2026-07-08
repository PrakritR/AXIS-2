-- Financials Phase 5: accounts payable (manager bills), budgets, owner distributions.

create table if not exists public.manager_bills (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null references auth.users (id) on delete cascade,
  vendor_id text,
  work_order_id text,
  property_id text,
  vendor_invoice_id uuid references public.vendor_invoices (id) on delete set null,
  bill_number text,
  description text not null default '',
  amount_cents bigint not null check (amount_cents > 0),
  due_date date,
  status text not null default 'draft' check (
    status in ('draft', 'pending_approval', 'approved', 'scheduled', 'paid', 'void')
  ),
  category_code text not null default 'maintenance',
  paid_expense_entry_id uuid references public.manager_expense_entries (id) on delete set null,
  approved_at timestamptz,
  approved_by uuid references auth.users (id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists manager_bills_manager_status_idx on public.manager_bills (manager_user_id, status);
create index if not exists manager_bills_due_date_idx on public.manager_bills (manager_user_id, due_date);

alter table public.vendor_invoices
  drop constraint if exists vendor_invoices_bill_id_fkey;
alter table public.vendor_invoices
  add constraint vendor_invoices_bill_id_fkey
  foreign key (bill_id) references public.manager_bills (id) on delete set null;

create table if not exists public.manager_budgets (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null references auth.users (id) on delete cascade,
  property_id text,
  fiscal_year integer not null,
  category_code text not null,
  monthly_amounts_cents jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (manager_user_id, property_id, fiscal_year, category_code)
);

create index if not exists manager_budgets_manager_year_idx on public.manager_budgets (manager_user_id, fiscal_year);

create table if not exists public.manager_property_owners (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null references auth.users (id) on delete cascade,
  property_id text not null,
  owner_name text not null,
  owner_email text,
  ownership_pct numeric(5, 2) not null default 100 check (ownership_pct > 0 and ownership_pct <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.manager_reserve_policies (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null references auth.users (id) on delete cascade,
  property_id text not null,
  maintenance_reserve_pct numeric(5, 2) not null default 0,
  vacancy_reserve_pct numeric(5, 2) not null default 0,
  capital_improvement_reserve_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (manager_user_id, property_id)
);

create table if not exists public.manager_owner_distributions (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null references auth.users (id) on delete cascade,
  property_id text not null,
  owner_id uuid references public.manager_property_owners (id) on delete set null,
  period_start date not null,
  period_end date not null,
  beginning_balance_cents bigint not null default 0,
  cash_in_cents bigint not null default 0,
  cash_out_cents bigint not null default 0,
  management_fee_cents bigint not null default 0,
  reserve_holdback_cents bigint not null default 0,
  adjustments_cents bigint not null default 0,
  distribution_cents bigint not null default 0,
  status text not null default 'draft' check (status in ('draft', 'approved', 'paid')),
  paid_at timestamptz,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists manager_owner_distributions_manager_idx
  on public.manager_owner_distributions (manager_user_id, period_end desc);

alter table public.manager_bills enable row level security;
alter table public.manager_budgets enable row level security;
alter table public.manager_property_owners enable row level security;
alter table public.manager_reserve_policies enable row level security;
alter table public.manager_owner_distributions enable row level security;

drop policy if exists manager_bills_owner on public.manager_bills;
create policy manager_bills_owner on public.manager_bills for all using (manager_user_id = auth.uid());

drop policy if exists manager_budgets_owner on public.manager_budgets;
create policy manager_budgets_owner on public.manager_budgets for all using (manager_user_id = auth.uid());

drop policy if exists manager_property_owners_owner on public.manager_property_owners;
create policy manager_property_owners_owner on public.manager_property_owners for all using (manager_user_id = auth.uid());

drop policy if exists manager_reserve_policies_owner on public.manager_reserve_policies;
create policy manager_reserve_policies_owner on public.manager_reserve_policies for all using (manager_user_id = auth.uid());

drop policy if exists manager_owner_distributions_owner on public.manager_owner_distributions;
create policy manager_owner_distributions_owner on public.manager_owner_distributions for all using (manager_user_id = auth.uid());
