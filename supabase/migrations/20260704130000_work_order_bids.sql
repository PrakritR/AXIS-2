-- Vendor portal Phase 2: tour -> bid pricing. A vendor submits a cost + time
-- bid on a work order the manager has opened for bids; the manager picks one,
-- which assigns that vendor at the agreed cost (see portal_work_order_records
-- row_data.vendorId / .cost, updated by the accept-bid route).

create table if not exists public.work_order_bids (
  id uuid primary key default gen_random_uuid(),
  work_order_id text not null references public.portal_work_order_records (id) on delete cascade,
  vendor_user_id uuid not null references auth.users (id) on delete cascade,
  vendor_directory_id text references public.manager_vendor_records (id) on delete set null,
  manager_user_id uuid not null references auth.users (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  proposed_time timestamptz not null,
  note text,
  status text not null default 'submitted' check (status in ('submitted', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_order_id, vendor_user_id)
);

create index if not exists work_order_bids_work_order_idx on public.work_order_bids (work_order_id);
create index if not exists work_order_bids_manager_idx on public.work_order_bids (manager_user_id);
create index if not exists work_order_bids_vendor_idx on public.work_order_bids (vendor_user_id);

alter table public.work_order_bids enable row level security;

-- A vendor sees and manages only their own bid rows; a manager sees only bids
-- on their own work orders (accept/decline happens through the service-role
-- API, matching the vendor_tax_profiles_owner / manager_vendor_records
-- read-only split modeled in the Phase 1 migration).
drop policy if exists work_order_bids_vendor_owner on public.work_order_bids;
create policy work_order_bids_vendor_owner on public.work_order_bids
  for all using (vendor_user_id = auth.uid())
  with check (vendor_user_id = auth.uid());

drop policy if exists work_order_bids_manager_read on public.work_order_bids;
create policy work_order_bids_manager_read on public.work_order_bids
  for select using (manager_user_id = auth.uid());
