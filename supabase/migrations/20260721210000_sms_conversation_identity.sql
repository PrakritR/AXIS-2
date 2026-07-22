-- Explicit per-counterparty SMS conversation identity.
--
-- Conversations used to be derived from the phone-number pair on the wire
-- (sms_from_number = To, profiles.phone = From). On a shared agent line that
-- pair collapses distinct people/roles into one thread. This migration makes
-- conversation identity EXPLICIT and durable on each stored message:
--
--   conversation_key = <owner_manager_user_id>:<counterparty_role>:<person_ref>
--
-- where person_ref is the counterparty's user id (an Axis account) when known,
-- otherwise their normalized phone. Two different people on one shared line now
-- always get different keys; the same person in two roles (prospect vs
-- resident) gets two threads, by design.
--
-- Existing history is backfilled so nothing is orphaned. The read paths derive
-- the same key at read time as a fallback for rows written before this ran, so
-- the app is correct with or without this applied — this table just makes it
-- durable and cheap to group.

-- Phone → stable `+<digits>` ref, matching conversationPhoneRef() in
-- src/lib/sms-conversation-identity.ts. IMMUTABLE so it can back an index.
create or replace function public.axis_sms_phone_ref(raw text)
returns text
language sql
immutable
as $$
  select case
    when raw is null then ''
    when regexp_replace(raw, '\D', '', 'g') = '' then trim(raw)
    when length(regexp_replace(raw, '\D', '', 'g')) = 10
      then '+1' || regexp_replace(raw, '\D', '', 'g')
    when length(regexp_replace(raw, '\D', '', 'g')) = 11
      and left(regexp_replace(raw, '\D', '', 'g'), 1) = '1'
      then '+' || regexp_replace(raw, '\D', '', 'g')
    else '+' || regexp_replace(raw, '\D', '', 'g')
  end
$$;

-- ── manager_sms_messages ────────────────────────────────────────────────────
alter table public.manager_sms_messages
  add column if not exists counterparty_role text not null default 'unknown'
    check (counterparty_role in
      ('resident', 'applicant', 'prospect', 'vendor', 'manager', 'admin', 'unknown')),
  add column if not exists conversation_key text;

-- Backfill role from Claw thread topic + resident linkage.
update public.manager_sms_messages m
set counterparty_role = case
  when exists (
    select 1 from public.claw_messaging_threads ct
    where ct.manager_user_id = m.manager_user_id
      and public.axis_sms_phone_ref(ct.resident_phone) = public.axis_sms_phone_ref(m.resident_phone)
      and ct.topic = 'leasing'
  ) then 'prospect'
  when m.resident_user_id is not null then 'resident'
  when exists (
    select 1 from public.claw_messaging_threads ct
    where ct.manager_user_id = m.manager_user_id
      and public.axis_sms_phone_ref(ct.resident_phone) = public.axis_sms_phone_ref(m.resident_phone)
  ) then 'resident'
  else 'unknown'
end
where m.counterparty_role = 'unknown';

update public.manager_sms_messages m
set conversation_key =
  coalesce(m.manager_user_id::text, '') || ':' || m.counterparty_role || ':' ||
  coalesce(nullif(m.resident_user_id::text, ''), public.axis_sms_phone_ref(m.resident_phone))
where m.conversation_key is null;

create index if not exists manager_sms_messages_conversation_idx
  on public.manager_sms_messages (manager_user_id, conversation_key, created_at desc);

-- ── inbound_sms_log ─────────────────────────────────────────────────────────
alter table public.inbound_sms_log
  add column if not exists counterparty_role text not null default 'unknown'
    check (counterparty_role in
      ('resident', 'applicant', 'prospect', 'vendor', 'manager', 'admin', 'unknown')),
  add column if not exists conversation_key text;

update public.inbound_sms_log l
set counterparty_role = case
  when exists (
    select 1 from public.claw_messaging_threads ct
    where ct.manager_user_id = l.manager_user_id
      and public.axis_sms_phone_ref(ct.resident_phone) = public.axis_sms_phone_ref(l.from_phone)
      and ct.topic = 'leasing'
  ) then 'prospect'
  when l.matched_sender_user_id is not null then 'resident'
  when exists (
    select 1 from public.claw_messaging_threads ct
    where ct.manager_user_id = l.manager_user_id
      and public.axis_sms_phone_ref(ct.resident_phone) = public.axis_sms_phone_ref(l.from_phone)
  ) then 'resident'
  else 'unknown'
end
where l.counterparty_role = 'unknown';

update public.inbound_sms_log l
set conversation_key =
  coalesce(l.manager_user_id::text, '') || ':' || l.counterparty_role || ':' ||
  coalesce(nullif(l.matched_sender_user_id::text, ''), public.axis_sms_phone_ref(l.from_phone))
where l.conversation_key is null;

create index if not exists inbound_sms_log_conversation_idx
  on public.inbound_sms_log (manager_user_id, conversation_key, created_at desc);
