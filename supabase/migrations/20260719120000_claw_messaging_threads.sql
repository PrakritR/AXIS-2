-- Durable Claw agent-line threads: manager personal phone ↔ resident phone.
-- Opened when Axis sends payment/lease/move-in SMS; used so manager replies
-- relay without relying on process-local memory (Vercel cold starts).

create table if not exists public.claw_messaging_threads (
  id text primary key,
  manager_user_id uuid not null references auth.users (id) on delete cascade,
  manager_phone text not null,
  resident_phone text not null,
  resident_user_id uuid references auth.users (id) on delete set null,
  resident_email text,
  topic text not null default 'general'
    check (topic in ('payment', 'lease', 'leasing', 'move_in', 'general')),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (manager_user_id, resident_phone)
);

create index if not exists claw_messaging_threads_resident_phone_idx
  on public.claw_messaging_threads (resident_phone);

create index if not exists claw_messaging_threads_manager_phone_idx
  on public.claw_messaging_threads (manager_phone);

create index if not exists claw_messaging_threads_manager_last_idx
  on public.claw_messaging_threads (manager_user_id, last_message_at desc);

alter table public.claw_messaging_threads enable row level security;

-- Service-role only (gateway + server routes). No authenticated client policies.
