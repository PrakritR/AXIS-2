-- SMS compliance: consent (opt-in/opt-out) ledger + outbound delivery status log.
--
-- Twilio Advanced Opt-Out handles the STOP/START auto-reply, but Axis must keep
-- its own record so it never texts a number that has opted out, and so delivery
-- status callbacks (queued/sent/delivered/failed) are auditable. Both tables are
-- service-role-only (the /api/twilio/* webhooks + sendSms write them); RLS is
-- enabled with NO policies to default-deny anon/authenticated PostgREST access,
-- mirroring inbound_sms_log.

create table if not exists public.sms_consent (
  phone text primary key,
  user_id uuid references auth.users (id) on delete set null,
  opted_in_at timestamptz,
  opted_out_at timestamptz,
  consent_source text,
  updated_at timestamptz not null default now()
);

create table if not exists public.sms_delivery_log (
  id uuid primary key default gen_random_uuid(),
  message_sid text,
  to_phone text not null,
  status text,
  error_code text,
  manager_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Idempotency for repeated/out-of-order status callbacks on the same message.
create unique index if not exists sms_delivery_log_message_sid_uniq
  on public.sms_delivery_log (message_sid)
  where message_sid is not null;

alter table public.sms_consent enable row level security;
alter table public.sms_delivery_log enable row level security;
