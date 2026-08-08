-- Idempotent backfill for every column the assistant pending-action insert path
-- uses. Production has shipped without intermediate migrations before; a single
-- additive pass keeps copy_listing_photos (and every other gated write)
-- confirmable after `db push` even when only the base table migration landed.
--
-- Pure no-op where these columns already exist (dev/test).

alter table public.agent_pending_actions
  add column if not exists portal text not null default 'manager';

alter table public.agent_pending_actions
  add column if not exists session_id uuid references public.agent_sessions (id) on delete set null;

alter table public.agent_pending_actions
  add column if not exists proposal_trace_id text;

create index if not exists agent_pending_actions_actor_idx
  on public.agent_pending_actions (user_id, status, created_at desc);

create index if not exists agent_pending_actions_proposal_trace_idx
  on public.agent_pending_actions (proposal_trace_id)
  where proposal_trace_id is not null;
