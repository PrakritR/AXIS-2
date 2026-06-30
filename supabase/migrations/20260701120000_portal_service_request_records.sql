-- Persist resident service/amenity requests server-side so they are shared by
-- account/house instead of trapped in browser localStorage (and so the AI agent
-- tool layer can read them). Mirrors the portal_work_order_records design.

create table if not exists public.portal_service_request_records (
  id text primary key,
  manager_user_id uuid,
  resident_email text,
  property_id text,
  status text,
  row_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_service_request_records_manager_idx
  on public.portal_service_request_records (manager_user_id);

create index if not exists portal_service_request_records_resident_email_idx
  on public.portal_service_request_records (lower(resident_email));

create index if not exists portal_service_request_records_property_idx
  on public.portal_service_request_records (property_id);

alter table public.portal_service_request_records enable row level security;

-- Client access goes through service-role API routes (no client policies), the
-- same access model as the other portal_*_records tables.
