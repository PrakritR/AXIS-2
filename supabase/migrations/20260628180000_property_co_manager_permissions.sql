-- Per-property co-manager permissions on account links.
-- Shape: { "property-id": { "applications": true, "payments": true } }

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'account_link_invites'
      and column_name = 'co_manager_permissions'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'account_link_invites'
      and column_name = 'property_co_manager_permissions'
  ) then
    alter table public.account_link_invites
      rename column co_manager_permissions to property_co_manager_permissions;
  end if;
end $$;

alter table public.account_link_invites
  add column if not exists property_co_manager_permissions jsonb not null default '{}'::jsonb;

comment on column public.account_link_invites.property_co_manager_permissions is
  'Per-property co-manager portal section grants. Keys are property ids; values are sparse permission maps.';

-- Backfill flat permission objects into per-property maps.
do $$
declare
  r record;
  new_perms jsonb;
  prop_id text;
  perm_keys text[] := array[
    'properties', 'editListings', 'applications', 'residents', 'leases',
    'payments', 'documents', 'financials', 'services', 'inbox', 'calendar'
  ];
  is_flat boolean;
begin
  for r in
    select id, assigned_property_ids, property_co_manager_permissions
    from public.account_link_invites
  loop
    if r.property_co_manager_permissions is null
      or r.property_co_manager_permissions = '{}'::jsonb then
      continue;
    end if;

    select exists (
      select 1
      from jsonb_object_keys(r.property_co_manager_permissions) as k(key)
      where k.key = any (perm_keys)
    ) into is_flat;

    if not is_flat then
      continue;
    end if;

    new_perms := '{}'::jsonb;
    for prop_id in
      select jsonb_array_elements_text(coalesce(r.assigned_property_ids, '[]'::jsonb))
    loop
      new_perms := new_perms || jsonb_build_object(prop_id, r.property_co_manager_permissions);
    end loop;

    update public.account_link_invites
    set property_co_manager_permissions = new_perms
    where id = r.id;
  end loop;
end $$;
