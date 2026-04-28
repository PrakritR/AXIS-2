-- Persist resident applications and work orders so they are shared by account/house instead of browser localStorage.

create table if not exists public.manager_application_records (
  id text primary key,
  manager_user_id uuid,
  resident_email text,
  property_id text,
  assigned_property_id text,
  row_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists manager_application_records_manager_idx
  on public.manager_application_records (manager_user_id);

create index if not exists manager_application_records_resident_email_idx
  on public.manager_application_records (lower(resident_email));

create index if not exists manager_application_records_property_idx
  on public.manager_application_records (property_id);

create table if not exists public.portal_work_order_records (
  id text primary key,
  manager_user_id uuid,
  resident_email text,
  property_id text,
  assigned_property_id text,
  row_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_work_order_records_manager_idx
  on public.portal_work_order_records (manager_user_id);

create index if not exists portal_work_order_records_resident_email_idx
  on public.portal_work_order_records (lower(resident_email));

create index if not exists portal_work_order_records_property_idx
  on public.portal_work_order_records (property_id);

alter table public.manager_application_records enable row level security;
alter table public.portal_work_order_records enable row level security;

-- Client access goes through service-role API routes.
