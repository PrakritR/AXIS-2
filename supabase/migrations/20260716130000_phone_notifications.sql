-- Phone/SMS system: personal-number verification + inbound reply routing prefs.
--
-- Design: outbound texts send FROM the manager's provisioned work number
-- (profiles.sms_from_number — carriers do not allow sending from a personal
-- number). Replies hit /api/twilio/inbound, land in the Axis inbox + email,
-- and are optionally forwarded to the manager's VERIFIED personal phone so it
-- feels like their own number.

alter table public.profiles
  add column if not exists phone_verified_at timestamptz,
  add column if not exists sms_forward_inbound boolean not null default true;

create table if not exists public.phone_verifications (
  user_id uuid primary key references auth.users (id) on delete cascade,
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.phone_verifications enable row level security;

-- Inbound SMS audit log (webhook writes via service role).
create table if not exists public.inbound_sms_log (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid references auth.users (id) on delete set null,
  from_phone text not null,
  to_phone text not null,
  matched_sender_user_id uuid references auth.users (id) on delete set null,
  body text not null default '',
  message_sid text,
  created_at timestamptz not null default now()
);

create index if not exists inbound_sms_log_manager_idx
  on public.inbound_sms_log (manager_user_id, created_at desc);

alter table public.inbound_sms_log enable row level security;
