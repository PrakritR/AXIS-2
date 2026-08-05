-- Link a gated write proposal back to the Langfuse turn that produced it so
-- confirm/deny can score `action-approved` on the ORIGINAL proposal trace.
-- Nullable: system-initiated proposals (e.g. tour approvals) have no chat turn
-- and therefore no Langfuse trace to attach.
alter table public.agent_pending_actions
  add column if not exists proposal_trace_id text;

create index if not exists agent_pending_actions_proposal_trace_idx
  on public.agent_pending_actions (proposal_trace_id)
  where proposal_trace_id is not null;
