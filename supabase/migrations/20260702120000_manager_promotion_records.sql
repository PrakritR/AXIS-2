-- Manager-authored promotional flyers (AI-composed copy + on-brand HTML flyer).
-- One row per generated/draft promotion, scoped to the owning manager. Reads and
-- writes go through the service-role /api/portal-promotions route (no client
-- policy), which always filters by manager_user_id.

create table if not exists public.manager_promotion_records (
  id text primary key,
  manager_user_id uuid not null,
  row_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists manager_promotion_records_manager_idx
  on public.manager_promotion_records (manager_user_id);

alter table public.manager_promotion_records enable row level security;
