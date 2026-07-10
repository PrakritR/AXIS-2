-- Per-property entry/access info (gate codes, lockbox) for vendor dispatch.
-- Deliberately a SEPARATE owner-only table, NOT a column on
-- manager_property_records: that table's `select_live` RLS policy exposes every
-- column of live rows to the anon key, which must never include access codes.
-- Composite key: property ids are app-level strings (listing ids, legacy/demo
-- ids) that are not guaranteed unique across managers.
create table if not exists public.manager_property_access (
  property_id text not null,
  manager_user_id uuid not null,
  access_info jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (property_id, manager_user_id)
);

create index if not exists manager_property_access_manager_idx
  on public.manager_property_access (manager_user_id);

alter table public.manager_property_access enable row level security;

-- Owner-only; no public/live policy exists on purpose. Real reads/writes go
-- through service-role API routes with explicit manager scoping.
drop policy if exists "manager_property_access_owner" on public.manager_property_access;
create policy "manager_property_access_owner"
  on public.manager_property_access
  for all
  using (auth.uid() = manager_user_id);
