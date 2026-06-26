-- Manager screening preferences + order audit trail for applicant credit/background checks.

alter table public.profiles
  add column if not exists screening_settings jsonb not null default '{"mode":"manual"}'::jsonb;

comment on column public.profiles.screening_settings is
  'Manager applicant screening preferences: off | manual | auto_on_submit.';

create table if not exists public.screening_orders (
  id uuid primary key default gen_random_uuid(),
  application_id text not null,
  manager_user_id uuid references public.profiles(id) on delete set null,
  provider text not null,
  external_order_id text not null,
  status text not null,
  row_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists screening_orders_provider_external_idx
  on public.screening_orders (provider, external_order_id);

create index if not exists screening_orders_application_idx
  on public.screening_orders (application_id);

create index if not exists screening_orders_manager_idx
  on public.screening_orders (manager_user_id);

alter table public.screening_orders enable row level security;
