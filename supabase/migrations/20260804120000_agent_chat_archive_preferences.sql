-- Durable, user-facing portal chat archive plus personal assistant preferences.
--
-- `agent_sessions` also backs the SMS agents, so portal chats get their own
-- explicit kind. Never move or rename the existing user_id claim key.
alter table public.agent_sessions
  add column if not exists title text;

create index if not exists agent_sessions_portal_chat_archive_idx
  on public.agent_sessions (user_id, portal, updated_at desc)
  where kind = 'portal_chat' and user_id is not null;

-- One private preference document per signed-in person. The service-role
-- routes own reads/writes after authenticating the current user; RLS therefore
-- deliberately exposes no direct browser policy.
create table if not exists public.agent_user_preferences (
  user_id uuid primary key,
  custom_instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.agent_user_preferences enable row level security;
