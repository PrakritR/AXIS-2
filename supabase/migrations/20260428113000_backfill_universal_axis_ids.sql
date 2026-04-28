-- Use the legacy profiles.manager_id column as the universal Axis ID for every portal account.
-- Existing manager IDs are preserved; older resident/owner/admin profiles receive stable IDs.

update public.profiles
set manager_id = 'AXIS-' || upper(substr(replace(id::text, '-', ''), 1, 8))
where coalesce(nullif(manager_id, ''), '') = '';
