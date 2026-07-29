-- Outbound SMS audit log for manager ↔ resident work-number texts (body + routing).
-- Inbound bodies live in inbound_sms_log; relay texts in sms_relay_messages.
-- This table fills the outbound gap so the Communication → SMS tab can show both directions.

create table if not exists public.manager_sms_messages (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null references auth.users (id) on delete cascade,
  resident_user_id uuid references auth.users (id) on delete set null,
  resident_phone text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  body text not null default '',
  from_phone text,
  to_phone text not null,
  message_sid text,
  source text not null default 'work_number'
    check (source in ('work_number', 'relay', 'automated')),
  created_at timestamptz not null default now()
);

create index if not exists manager_sms_messages_manager_phone_idx
  on public.manager_sms_messages (manager_user_id, resident_phone, created_at desc);

create unique index if not exists manager_sms_messages_sid_uniq
  on public.manager_sms_messages (message_sid)
  where message_sid is not null;

alter table public.manager_sms_messages enable row level security;

drop policy if exists manager_sms_messages_manager_read on public.manager_sms_messages;
create policy manager_sms_messages_manager_read on public.manager_sms_messages
  for select using (manager_user_id = auth.uid());
