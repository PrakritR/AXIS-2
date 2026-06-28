-- AI agent + observability foundation.
-- Audit log for state-changing tool actions, agent session/message persistence
-- for replayable/attributable traces, and pgvector for future document retrieval.

create extension if not exists vector;

-- Every state-changing tool action writes one row here.
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  landlord_id uuid not null,
  action text not null,
  tool_name text,
  input_summary jsonb,
  result_summary jsonb,
  -- Idempotency key for state-changing actions (e.g. one rent reminder per
  -- charge per day). A unique violation on insert means the action already ran.
  dedupe_key text unique,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_landlord_idx on public.audit_log (landlord_id, created_at desc);

-- One row per agent conversation, scoped to a landlord + user.
create table if not exists public.agent_sessions (
  id uuid primary key default gen_random_uuid(),
  landlord_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_sessions_landlord_idx on public.agent_sessions (landlord_id, updated_at desc);

-- Messages within a session (for replay and building the eval set).
create table if not exists public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.agent_sessions (id) on delete cascade,
  landlord_id uuid not null,
  role text not null,
  content text not null,
  tool_trace jsonb,
  created_at timestamptz not null default now()
);
create index if not exists agent_messages_session_idx on public.agent_messages (session_id, created_at);

-- RLS: these tables are written via the service-role client with explicit
-- landlord scoping. Enable RLS and deny anon/auth access by default; the
-- service role bypasses RLS. Add per-landlord read policies when the UI needs them.
alter table public.audit_log enable row level security;
alter table public.agent_sessions enable row level security;
alter table public.agent_messages enable row level security;
