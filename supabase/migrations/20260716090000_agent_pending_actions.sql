-- Agent write-action framework: proposed actions awaiting user confirmation.
--
-- A write tool call from the model never executes directly. The loop halts,
-- the validated input + human-readable preview are persisted here, and the
-- client receives only this row's opaque id. Confirming re-validates the
-- stored input and re-resolves ownership before executing. The atomic claim
-- (status='pending' AND expires_at > now()) makes confirmation exactly-once.

create table if not exists public.agent_pending_actions (
  id uuid primary key default gen_random_uuid(),
  -- The authenticated user who can confirm this action (manager, resident, or
  -- vendor). The claim is always scoped to this id — a foreign user's confirm
  -- can never match.
  actor_user_id uuid not null,
  portal text not null, -- 'manager' | 'resident' | 'vendor'
  -- Set for manager-portal actions (equals actor for managers today; kept as a
  -- separate column so admin-on-behalf-of flows stay expressible).
  landlord_id uuid,
  session_id uuid references public.agent_sessions (id) on delete set null,
  tool_name text not null,
  input jsonb not null,   -- Zod-validated, preview-normalized tool input
  preview jsonb not null, -- the ActionPreview shown to the user
  status text not null default 'pending', -- pending|confirmed|cancelled|expired|superseded
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  resolved_at timestamptz
);

-- Reconcile a pre-existing ad-hoc version of this table (dev DB had one with
-- `user_id` and no portal/session_id): rename + add the missing columns.
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'agent_pending_actions' and column_name = 'user_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'agent_pending_actions' and column_name = 'actor_user_id'
  ) then
    alter table public.agent_pending_actions rename column user_id to actor_user_id;
  end if;
end $$;
alter table public.agent_pending_actions add column if not exists portal text not null default 'manager';
alter table public.agent_pending_actions
  add column if not exists session_id uuid references public.agent_sessions (id) on delete set null;
alter table public.agent_pending_actions add column if not exists landlord_id uuid;

create index if not exists agent_pending_actions_actor_idx
  on public.agent_pending_actions (actor_user_id, status, created_at desc);

-- Service-role writes only, like the sibling agent tables: enable RLS with no
-- policies so anon/auth roles are denied by default.
alter table public.agent_pending_actions enable row level security;

-- Sessions/messages now serve all three portals. `landlord_id` remains the
-- scope column: the manager id for manager sessions, the actor's own user id
-- for resident/vendor sessions. `portal` records which surface the session
-- belongs to.
alter table public.agent_sessions add column if not exists portal text not null default 'manager';
alter table public.agent_messages add column if not exists portal text not null default 'manager';
