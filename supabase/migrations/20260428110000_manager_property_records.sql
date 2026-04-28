create table if not exists public.manager_property_records (
  id text primary key,
  manager_user_id uuid references auth.users (id) on delete set null,
  status text not null check (status in ('pending', 'live', 'review', 'request_change', 'unlisted', 'rejected')),
  row_data jsonb,
  property_data jsonb,
  edit_request_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists manager_property_records_manager_status_idx
  on public.manager_property_records (manager_user_id, status);

create index if not exists manager_property_records_status_idx
  on public.manager_property_records (status);

alter table public.manager_property_records enable row level security;

drop policy if exists "manager_property_records_select_live" on public.manager_property_records;
create policy "manager_property_records_select_live"
  on public.manager_property_records
  for select
  using (status = 'live');

drop policy if exists "manager_property_records_select_own" on public.manager_property_records;
create policy "manager_property_records_select_own"
  on public.manager_property_records
  for select
  using (auth.uid() = manager_user_id);

-- Writes are done by server routes with the service role so admin actions can move rows across buckets safely.
