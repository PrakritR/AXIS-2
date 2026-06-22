-- Co-manager permission grants on account links (replaces owner/manager tab split for invites).

alter table public.account_link_invites
  add column if not exists co_manager_permissions jsonb not null default '{}'::jsonb;

comment on column public.account_link_invites.co_manager_permissions is
  'Permission flags granted by the inviter to the linked co-manager workspace.';
