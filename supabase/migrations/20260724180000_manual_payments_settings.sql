alter table public.manager_automation_settings
  add column if not exists manual_payments jsonb not null default '{}'::jsonb;
