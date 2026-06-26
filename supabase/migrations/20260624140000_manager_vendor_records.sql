-- Manager-maintained vendor directory for work order assignment.

create table if not exists public.manager_vendor_records (
  id text primary key,
  manager_user_id uuid not null,
  row_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists manager_vendor_records_manager_idx
  on public.manager_vendor_records (manager_user_id);

alter table public.manager_vendor_records enable row level security;
