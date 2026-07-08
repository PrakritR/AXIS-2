-- Phase 1: double-entry general ledger (gl_journal_entries + gl_journal_lines).

create table if not exists public.gl_journal_entries (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null references auth.users (id) on delete cascade,
  property_id text,
  entry_date date not null,
  memo text,
  source_type text not null check (
    source_type in (
      'charge',
      'payment',
      'refund',
      'expense',
      'bill',
      'deposit_receipt',
      'deposit_refund',
      'owner_distribution',
      'payout',
      'stripe_fee',
      'manual',
      'adjustment'
    )
  ),
  source_id text not null,
  is_reversal boolean not null default false,
  reversed_entry_id uuid references public.gl_journal_entries (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists gl_journal_entries_source_unique
  on public.gl_journal_entries (manager_user_id, source_type, source_id)
  where is_reversal = false;

create index if not exists gl_journal_entries_manager_date_idx
  on public.gl_journal_entries (manager_user_id, entry_date);

create table if not exists public.gl_journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.gl_journal_entries (id) on delete cascade,
  account_code text not null,
  debit_cents bigint not null default 0 check (debit_cents >= 0),
  credit_cents bigint not null default 0 check (credit_cents >= 0),
  property_id text,
  resident_user_id uuid references auth.users (id) on delete set null,
  vendor_id text,
  memo text,
  check (not (debit_cents > 0 and credit_cents > 0)),
  check (debit_cents > 0 or credit_cents > 0)
);

create index if not exists gl_journal_lines_entry_idx
  on public.gl_journal_lines (journal_entry_id);

create index if not exists gl_journal_lines_account_idx
  on public.gl_journal_lines (account_code);

-- Link ledger cash events back to their GL journal (optional audit pointer).
alter table public.ledger_entries
  add column if not exists gl_journal_entry_id uuid references public.gl_journal_entries (id) on delete set null;

create index if not exists ledger_entries_gl_journal_entry_id_idx
  on public.ledger_entries (gl_journal_entry_id)
  where gl_journal_entry_id is not null;

-- Defense-in-depth RLS (real writes use service role).
alter table public.gl_journal_entries enable row level security;
alter table public.gl_journal_lines enable row level security;

drop policy if exists gl_journal_entries_manager_read on public.gl_journal_entries;
create policy gl_journal_entries_manager_read on public.gl_journal_entries
  for select using (manager_user_id = auth.uid());

drop policy if exists gl_journal_lines_manager_read on public.gl_journal_lines;
create policy gl_journal_lines_manager_read on public.gl_journal_lines
  for select using (
    exists (
      select 1
      from public.gl_journal_entries e
      where e.id = journal_entry_id
        and e.manager_user_id = auth.uid()
    )
  );
