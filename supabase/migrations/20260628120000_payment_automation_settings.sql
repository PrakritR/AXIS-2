-- Manager-configured payment reminder automation and per-message overrides.

create table if not exists public.manager_automation_settings (
  manager_user_id uuid primary key,
  row_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists manager_automation_settings_updated_idx
  on public.manager_automation_settings (updated_at desc);

create table if not exists public.scheduled_message_overrides (
  id text primary key,
  manager_user_id uuid not null,
  charge_id text not null,
  reminder_kind text not null,
  days_before_due integer,
  row_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists scheduled_message_overrides_unique_idx
  on public.scheduled_message_overrides (
    manager_user_id,
    charge_id,
    reminder_kind,
    coalesce(days_before_due, -1)
  );

create index if not exists scheduled_message_overrides_manager_idx
  on public.scheduled_message_overrides (manager_user_id);
