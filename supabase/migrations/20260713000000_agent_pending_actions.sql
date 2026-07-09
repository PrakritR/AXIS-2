-- Agent proposed write actions. A proposal is created server-side when the
-- model emits a write tool_use; the client confirms with ONLY the row id, so
-- model/client-supplied arguments are never trusted at confirm time. The
-- atomic status flip (proposed -> executed/denied) is the replay guard, and
-- the stored preview is an audit of exactly what the user was shown.
create table if not exists public.agent_pending_actions (
  id uuid primary key default gen_random_uuid(),
  landlord_id uuid not null,
  user_id uuid not null,
  tool_name text not null,
  input jsonb not null,
  preview jsonb not null,
  status text not null default 'proposed', -- proposed | executed | denied | failed
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  resolved_at timestamptz
);

create index if not exists agent_pending_actions_landlord_idx
  on public.agent_pending_actions (landlord_id, created_at desc);

-- Written via the service role only (same posture as audit_log); landlord
-- scoping is enforced in code on every read/claim.
-- ponytail: resolved/expired rows accumulate; add a cron cleanup if volume matters.
alter table public.agent_pending_actions enable row level security;
