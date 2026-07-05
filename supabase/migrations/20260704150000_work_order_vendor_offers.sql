-- WO automation Slice D: manager reviews suggested vendors and confirms sending the
-- work order to one or more of them for a free consultation/quote. Unlike
-- portal_work_order_records.vendor_user_id (a single assignment column), several
-- vendors can be offered the same work order concurrently, so a not-yet-assigned
-- work order's vendor-portal visibility and bid-eligibility are resolved through
-- this table instead of that single column (see work_order_bids for the responses
-- these offers solicit).

create table if not exists public.work_order_vendor_offers (
  id uuid primary key default gen_random_uuid(),
  work_order_id text not null references public.portal_work_order_records (id) on delete cascade,
  vendor_directory_id text not null references public.manager_vendor_records (id) on delete cascade,
  vendor_user_id uuid references auth.users (id) on delete cascade,
  manager_user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'sent' check (status in ('sent', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_order_id, vendor_directory_id)
);

create index if not exists work_order_vendor_offers_work_order_idx on public.work_order_vendor_offers (work_order_id);
create index if not exists work_order_vendor_offers_vendor_user_idx on public.work_order_vendor_offers (vendor_user_id);
create index if not exists work_order_vendor_offers_manager_idx on public.work_order_vendor_offers (manager_user_id);

alter table public.work_order_vendor_offers enable row level security;

-- Read-only for both sides; all writes (create the offer, send the notification)
-- go through the service-role "send to vendor(s)" API, matching the
-- work_order_bids / manager_vendor_records read-only-RLS split.
drop policy if exists work_order_vendor_offers_vendor_read on public.work_order_vendor_offers;
create policy work_order_vendor_offers_vendor_read on public.work_order_vendor_offers
  for select using (vendor_user_id = auth.uid());

drop policy if exists work_order_vendor_offers_manager_read on public.work_order_vendor_offers;
create policy work_order_vendor_offers_manager_read on public.work_order_vendor_offers
  for select using (manager_user_id = auth.uid());
