-- Close RLS gap: both tables are service-role-only (no user-context client ever
-- touches them; see payment-automation-settings.ts, automation-settings/route.ts,
-- scheduled-messages routes, and the payment-reminders cron). Enabling RLS with
-- no policies default-denies anon/authenticated access via PostgREST while
-- leaving service-role callers unaffected, matching manager_vendor_records.

alter table public.manager_automation_settings enable row level security;
alter table public.scheduled_message_overrides enable row level security;
