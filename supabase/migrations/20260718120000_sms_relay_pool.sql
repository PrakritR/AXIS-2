-- Proxy-pair SMS relay: a pool of Twilio numbers that let a manager and a
-- resident text each other from their personal phones without exposing either
-- number. Routing key is the pair (participant_phone, proxy_phone), which must
-- be globally unique among active bindings. One proxy number serves unlimited
-- residents but only ONE thread per manager, so pool size scales with the
-- largest manager's concurrent threads, not total residents.
--
-- Relay numbers are DISJOINT from per-manager work numbers
-- (profiles.sms_from_number): /api/twilio/inbound checks relay bindings first,
-- then falls back to the work-number → Axis-inbox path. A number must never be
-- in both systems.

create table if not exists public.sms_relay_numbers (
  id             uuid primary key default gen_random_uuid(),
  phone_e164     text not null unique,
  twilio_sid     text not null unique,
  status         text not null default 'available'
                 check (status in ('available','cooldown','quarantined')),
  cooldown_until timestamptz,
  created_at     timestamptz not null default now()
);

create table if not exists public.sms_relay_threads (
  id                 uuid primary key default gen_random_uuid(),
  manager_user_id    uuid not null references auth.users(id) on delete cascade,
  proxy_number_id    uuid not null references public.sms_relay_numbers(id),
  -- App-level counterparty identity (loosely-typed ids, matching
  -- ledger_entries/manager_documents conventions — there is no tenancies table).
  counterparty_user_id uuid,
  counterparty_name  text,
  label              text,
  state              text not null default 'active' check (state in ('active','closed')),
  closed_at          timestamptz,
  created_at         timestamptz not null default now()
);
create index if not exists sms_relay_threads_manager_idx on public.sms_relay_threads (manager_user_id, state);

-- THE ROUTING TABLE. (participant_phone, proxy_phone) → thread + role.
create table if not exists public.sms_relay_bindings (
  id                uuid primary key default gen_random_uuid(),
  thread_id         uuid not null references public.sms_relay_threads(id) on delete cascade,
  user_id           uuid,
  role              text not null check (role in ('manager','resident')),
  participant_phone text not null,   -- E.164 personal cell
  proxy_phone       text not null,   -- E.164, denormalized for webhook-time lookup
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

-- The constraint that makes routing deterministic: an ambiguous pair would
-- deliver messages to the wrong person.
create unique index if not exists sms_relay_bindings_pair_uniq
  on public.sms_relay_bindings (participant_phone, proxy_phone)
  where active;
create index if not exists sms_relay_bindings_lookup
  on public.sms_relay_bindings (proxy_phone, participant_phone) where active;
create index if not exists sms_relay_bindings_thread_idx
  on public.sms_relay_bindings (thread_id) where active;

create table if not exists public.sms_relay_messages (
  id              uuid primary key default gen_random_uuid(),
  thread_id       uuid not null references public.sms_relay_threads(id) on delete cascade,
  -- Denormalized so the manager read policy needs no join (work_order_bids pattern).
  manager_user_id uuid not null,
  twilio_sid      text unique,      -- idempotency: Twilio retries webhooks
  sender_user_id  uuid,
  sender_role     text not null check (sender_role in ('manager','resident','system')),
  channel_in      text not null check (channel_in in ('sms','app')),
  body            text,
  media_urls      text[],
  created_at      timestamptz not null default now()
);
create index if not exists sms_relay_messages_thread_idx
  on public.sms_relay_messages (thread_id, created_at desc);

-- RLS: numbers + bindings are service-role only (bindings map every tenant's
-- real cell to their landlord — PII of the highest order; no client policy at
-- all). Threads/messages get a manager read policy as defense in depth; all
-- writes go through service-role API routes like every other portal table.
alter table public.sms_relay_numbers enable row level security;
alter table public.sms_relay_bindings enable row level security;
alter table public.sms_relay_threads enable row level security;
alter table public.sms_relay_messages enable row level security;

drop policy if exists sms_relay_threads_manager_read on public.sms_relay_threads;
create policy sms_relay_threads_manager_read on public.sms_relay_threads
  for select using (manager_user_id = auth.uid());

drop policy if exists sms_relay_messages_manager_read on public.sms_relay_messages;
create policy sms_relay_messages_manager_read on public.sms_relay_messages
  for select using (manager_user_id = auth.uid());

-- Concurrency-safe allocator: first available number this manager is not
-- already using on an active thread. NULL means the pool is exhausted for
-- this manager (top-up cron should be alerted).
create or replace function public.allocate_sms_proxy_number(p_manager_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_number_id uuid;
begin
  select n.id into v_number_id
  from sms_relay_numbers n
  where n.status = 'available'
    and not exists (
      select 1 from sms_relay_threads t
      where t.manager_user_id  = p_manager_id
        and t.state            = 'active'
        and t.proxy_number_id  = n.id
    )
  order by n.created_at
  limit 1
  for update skip locked;

  return v_number_id;
end;
$$;

revoke execute on function public.allocate_sms_proxy_number(uuid) from anon, authenticated;

-- Private bucket for inbound MMS media (leak photos etc.). Bytes are reachable
-- only via server-minted signed URLs after an ownership check, mirroring
-- manager-documents.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sms-media',
  'sms-media',
  false,
  10485760, -- 10 MB
  array['image/jpeg','image/png','image/gif','image/webp','image/heic','application/pdf','video/3gpp','video/mp4','audio/mpeg','audio/ogg','text/vcard']
)
on conflict (id) do nothing;

drop policy if exists "sms_media_owner_objects" on storage.objects;
create policy "sms_media_owner_objects"
  on storage.objects for select
  using (
    bucket_id = 'sms-media'
    and (storage.foldername(name))[1] = 'manager'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
