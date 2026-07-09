-- Backfill related_user_id on portal_pro_relationship_records from
-- row_data->>'linkedUserId'.
--
-- Historic rows were written with related_user_id NULL because the record
-- upsert only read a `relatedUserId` field, while the relationship record
-- produced from accepted invites carries the counterpart's auth id as
-- `linkedUserId`. With related_user_id NULL, the GET scope
-- (manager_user_id = me OR related_user_id = me OR related_email = me) matched
-- only the participant whose own browser wrote the row, so an accepted
-- co-manager link resolved for one side but not the other. The route now
-- populates related_user_id from linkedUserId going forward; this repairs the
-- rows that predate that fix.
update public.portal_pro_relationship_records
set related_user_id = (row_data->>'linkedUserId')::uuid
where related_user_id is null
  and coalesce(row_data->>'linkedUserId', '') ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
