-- Vendor-agent conversations reuse the dormant agent_sessions/agent_messages
-- tables (zero writers before this feature). A vendor session binds one work
-- order + one vendor + one channel-agnostic conversation; user_id becomes
-- nullable because an invited-but-not-signed-up vendor only has a phone number.
alter table public.agent_sessions
  alter column user_id drop not null,
  add column if not exists kind text not null default 'manager_chat',
  add column if not exists vendor_user_id uuid,
  add column if not exists vendor_directory_id text,
  add column if not exists work_order_id text,
  add column if not exists vendor_phone_e164 text,
  add column if not exists language text,
  add column if not exists status text not null default 'active',
  add column if not exists inbox_thread_id text;

-- Inbound SMS resolves the newest active session for the sender's number.
create index if not exists agent_sessions_vendor_phone_idx
  on public.agent_sessions (vendor_phone_e164, updated_at desc)
  where kind = 'vendor_work_order';

-- One conversation per (work order, vendor); dispatch re-runs upsert into it.
-- Non-partial on purpose: manager_chat rows carry NULLs (distinct under the
-- default NULLS DISTINCT), and PostgREST upsert cannot infer a partial index.
create unique index if not exists agent_sessions_vendor_wo_uidx
  on public.agent_sessions (work_order_id, vendor_directory_id);

alter table public.agent_messages
  add column if not exists channel text; -- 'sms' | 'inbox' | 'agent'
