-- Per-manager Google Calendar OAuth tokens and sync preferences (server-only via service role).
alter table public.manager_automation_settings
  add column if not exists google_calendar jsonb not null default '{}'::jsonb;
