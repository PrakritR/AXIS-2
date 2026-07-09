-- The 20260628180000 migration renamed co_manager_permissions to
-- property_co_manager_permissions, but the account-links API still selects the
-- legacy column as a fallback — on any database that ran the rename, every
-- select errored and the co-manager system silently fell back to local-only
-- mode. Restore the column (empty default) so both shapes exist.
alter table public.account_link_invites
  add column if not exists co_manager_permissions jsonb not null default '{}'::jsonb;
