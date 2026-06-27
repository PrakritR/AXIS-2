-- Financials reporting: ledger, expenses, chart of accounts, tax profiles.

create table if not exists public.chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid references auth.users (id) on delete cascade,
  code text not null,
  name text not null,
  account_type text not null check (account_type in ('income', 'expense')),
  is_system boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists chart_of_accounts_system_code_idx
  on public.chart_of_accounts (code) where manager_user_id is null;
create unique index if not exists chart_of_accounts_manager_code_idx
  on public.chart_of_accounts (manager_user_id, code) where manager_user_id is not null;
create index if not exists chart_of_accounts_manager_idx on public.chart_of_accounts (manager_user_id);

insert into public.chart_of_accounts (manager_user_id, code, name, account_type, is_system, sort_order)
values
  (null, 'rent_income', 'Rent Income', 'income', true, 10),
  (null, 'late_fees', 'Late Fees', 'income', true, 20),
  (null, 'pet_rent', 'Pet Rent', 'income', true, 30),
  (null, 'application_fee', 'Application Fee', 'income', true, 40),
  (null, 'other_income', 'Other Income', 'income', true, 50),
  (null, 'maintenance', 'Maintenance', 'expense', true, 110),
  (null, 'utilities', 'Utilities', 'expense', true, 120),
  (null, 'taxes', 'Taxes', 'expense', true, 130),
  (null, 'insurance', 'Insurance', 'expense', true, 140),
  (null, 'management', 'Management', 'expense', true, 150),
  (null, 'other_expense', 'Other Expense', 'expense', true, 160)
on conflict do nothing;

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid references auth.users (id) on delete set null,
  resident_user_id uuid references auth.users (id) on delete set null,
  resident_email text,
  property_id text,
  unit_label text,
  lease_id text,
  entry_type text not null check (entry_type in ('charge', 'payment')),
  category_code text not null,
  amount_cents bigint not null check (amount_cents >= 0),
  due_date date,
  posted_date date,
  source_charge_id text references public.portal_household_charge_records (id) on delete set null,
  description text,
  stripe_checkout_session_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ledger_entries_manager_posted_idx
  on public.ledger_entries (manager_user_id, posted_date);
create index if not exists ledger_entries_resident_posted_idx
  on public.ledger_entries (resident_user_id, posted_date);
create index if not exists ledger_entries_resident_email_idx
  on public.ledger_entries (lower(resident_email));
create index if not exists ledger_entries_property_idx
  on public.ledger_entries (property_id);
create unique index if not exists ledger_entries_charge_type_unique
  on public.ledger_entries (source_charge_id, entry_type)
  where source_charge_id is not null;

create table if not exists public.manager_expense_entries (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null references auth.users (id) on delete cascade,
  property_id text,
  category_code text not null,
  amount_cents bigint not null check (amount_cents > 0),
  expense_date date not null,
  memo text,
  vendor_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists manager_expense_entries_manager_date_idx
  on public.manager_expense_entries (manager_user_id, expense_date);
create index if not exists manager_expense_entries_vendor_idx
  on public.manager_expense_entries (manager_user_id, vendor_id);

create table if not exists public.vendor_tax_profiles (
  vendor_id text primary key,
  manager_user_id uuid not null references auth.users (id) on delete cascade,
  legal_name text,
  business_name text,
  entity_type text check (entity_type in ('individual', 'business')),
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  zip text,
  tin_type text check (tin_type in ('ein', 'ssn')),
  tin_last4 text,
  tin_ciphertext text,
  w9_received_at timestamptz,
  w9_attestation boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vendor_tax_profiles_manager_idx
  on public.vendor_tax_profiles (manager_user_id);

create table if not exists public.manager_tax_profiles (
  manager_user_id uuid primary key references auth.users (id) on delete cascade,
  legal_name text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  zip text,
  tin_type text check (tin_type in ('ein', 'ssn')),
  tin_last4 text,
  tin_ciphertext text,
  updated_at timestamptz not null default now()
);

alter table public.chart_of_accounts enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.manager_expense_entries enable row level security;
alter table public.vendor_tax_profiles enable row level security;
alter table public.manager_tax_profiles enable row level security;

drop policy if exists chart_of_accounts_read on public.chart_of_accounts;
create policy chart_of_accounts_read on public.chart_of_accounts
  for select using (manager_user_id is null or manager_user_id = auth.uid());

drop policy if exists ledger_entries_manager_read on public.ledger_entries;
create policy ledger_entries_manager_read on public.ledger_entries
  for select using (manager_user_id = auth.uid());

drop policy if exists ledger_entries_resident_read on public.ledger_entries;
create policy ledger_entries_resident_read on public.ledger_entries
  for select using (
    resident_user_id = auth.uid()
    or lower(coalesce(resident_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists manager_expense_entries_owner on public.manager_expense_entries;
create policy manager_expense_entries_owner on public.manager_expense_entries
  for all using (manager_user_id = auth.uid())
  with check (manager_user_id = auth.uid());

drop policy if exists vendor_tax_profiles_owner on public.vendor_tax_profiles;
create policy vendor_tax_profiles_owner on public.vendor_tax_profiles
  for all using (manager_user_id = auth.uid())
  with check (manager_user_id = auth.uid());

drop policy if exists manager_tax_profiles_owner on public.manager_tax_profiles;
create policy manager_tax_profiles_owner on public.manager_tax_profiles
  for all using (manager_user_id = auth.uid())
  with check (manager_user_id = auth.uid());
