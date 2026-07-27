-- Backfill the multi-portal columns on the agent write-action tables.
--
-- These columns were first introduced by 20260716090000_agent_pending_actions.sql,
-- but that migration was never applied to the production database (its version is
-- absent from production's schema_migrations while the table-create migration is
-- present). The result: production's `agent_pending_actions` lacked `portal` and
-- `session_id`, so EVERY manager write proposal — which always inserts
-- `portal` (see createPendingActionForUser in src/lib/tools/pending-actions.ts) —
-- failed with a PostgREST unknown-column error. That error was swallowed and the
-- assistant fell back to "I drafted an action but could not show the confirmation
-- card", making every proposed action unconfirmable in production.
--
-- This migration re-applies those additions idempotently so a `db push` fixes
-- production regardless of how the earlier version was (not) recorded. It is a
-- pure no-op on any database that already has the columns (e.g. dev/test).
--
-- Additive-only on purpose: it must NEVER rename or drop `user_id` (the live
-- claim key in dev AND production) or any existing column. See AGENTS.md.

alter table public.agent_pending_actions
  add column if not exists portal text not null default 'manager';
alter table public.agent_pending_actions
  add column if not exists session_id uuid references public.agent_sessions (id) on delete set null;

create index if not exists agent_pending_actions_actor_idx
  on public.agent_pending_actions (user_id, status, created_at desc);

alter table public.agent_sessions add column if not exists portal text not null default 'manager';
alter table public.agent_messages add column if not exists portal text not null default 'manager';
