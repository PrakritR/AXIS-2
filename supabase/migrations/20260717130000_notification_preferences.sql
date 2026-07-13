-- Per-user notification channel preferences (inbox / email / SMS by category).
-- Keyed on the auth user id (generic — managers, residents, vendors all have a
-- row) and stored as a jsonb blob, mirroring manager_automation_settings.

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  row_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_preferences_updated_idx
  on public.notification_preferences (updated_at desc);

-- Service-role-only, matching the automation-settings pattern: this table is
-- only ever read/written by the service-role notification-preferences route and
-- the delivery fan-out. Enabling RLS with NO policies default-denies
-- anon/authenticated access via PostgREST while leaving service-role callers
-- unaffected.
alter table public.notification_preferences enable row level security;
