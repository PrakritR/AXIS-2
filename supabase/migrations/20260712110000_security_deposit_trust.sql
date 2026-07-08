-- Phase 3: security deposit trust sub-ledger + banking/reconciliation foundation.

create table if not exists public.security_deposit_ledger (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null references auth.users (id) on delete cascade,
  source_charge_id text not null,
  property_id text,
  unit_label text,
  lease_id text,
  resident_user_id uuid references auth.users (id) on delete set null,
  resident_email text not null,
  amount_cents bigint not null check (amount_cents > 0),
  amount_held_cents bigint not null check (amount_held_cents >= 0),
  received_date date not null,
  status text not null default 'held' check (
    status in ('held', 'partially_refunded', 'refunded', 'forfeited', 'applied_to_damages')
  ),
  disposition_type text check (
    disposition_type is null
    or disposition_type in ('full_refund', 'itemized_partial', 'full_withhold')
  ),
  disposition_date date,
  itemization jsonb not null default '[]'::jsonb,
  receipt_journal_entry_id uuid references public.gl_journal_entries (id) on delete set null,
  disposition_journal_entry_id uuid references public.gl_journal_entries (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (manager_user_id, source_charge_id)
);

create index if not exists security_deposit_ledger_manager_status_idx
  on public.security_deposit_ledger (manager_user_id, status);

create index if not exists security_deposit_ledger_resident_idx
  on public.security_deposit_ledger (manager_user_id, resident_email);

create table if not exists public.manager_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  account_type text not null check (
    account_type in ('operating', 'trust_rental', 'trust_security_deposit')
  ),
  gl_account_code text not null,
  last_four text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists manager_bank_accounts_manager_idx
  on public.manager_bank_accounts (manager_user_id);

create table if not exists public.manager_bank_statements (
  id uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references public.manager_bank_accounts (id) on delete cascade,
  manager_user_id uuid not null references auth.users (id) on delete cascade,
  statement_date date not null,
  opening_balance_cents bigint not null default 0,
  closing_balance_cents bigint not null default 0,
  reconciled_at timestamptz,
  reconciled_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists manager_bank_statements_account_date_idx
  on public.manager_bank_statements (bank_account_id, statement_date desc);

create table if not exists public.manager_bank_statement_lines (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.manager_bank_statements (id) on delete cascade,
  line_date date not null,
  description text not null default '',
  amount_cents bigint not null,
  matched_ledger_entry_id uuid references public.ledger_entries (id) on delete set null,
  cleared boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists manager_bank_statement_lines_statement_idx
  on public.manager_bank_statement_lines (statement_id);

create table if not exists public.manager_reclassification_log (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null references auth.users (id) on delete cascade,
  action_type text not null,
  row_count integer not null default 0,
  total_cents bigint not null default 0,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists manager_reclassification_log_manager_idx
  on public.manager_reclassification_log (manager_user_id, created_at desc);

-- RLS (defense-in-depth; API uses service role).
alter table public.security_deposit_ledger enable row level security;
alter table public.manager_bank_accounts enable row level security;
alter table public.manager_bank_statements enable row level security;
alter table public.manager_bank_statement_lines enable row level security;
alter table public.manager_reclassification_log enable row level security;

drop policy if exists security_deposit_ledger_owner on public.security_deposit_ledger;
create policy security_deposit_ledger_owner on public.security_deposit_ledger
  for all using (manager_user_id = auth.uid());

drop policy if exists manager_bank_accounts_owner on public.manager_bank_accounts;
create policy manager_bank_accounts_owner on public.manager_bank_accounts
  for all using (manager_user_id = auth.uid());

drop policy if exists manager_bank_statements_owner on public.manager_bank_statements;
create policy manager_bank_statements_owner on public.manager_bank_statements
  for all using (manager_user_id = auth.uid());

drop policy if exists manager_bank_statement_lines_owner on public.manager_bank_statement_lines;
create policy manager_bank_statement_lines_owner on public.manager_bank_statement_lines
  for select using (
    exists (
      select 1
      from public.manager_bank_statements s
      where s.id = statement_id and s.manager_user_id = auth.uid()
    )
  );

drop policy if exists manager_reclassification_log_owner on public.manager_reclassification_log;
create policy manager_reclassification_log_owner on public.manager_reclassification_log
  for select using (manager_user_id = auth.uid());
