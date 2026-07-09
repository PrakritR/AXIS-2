-- Clear related_user_id / related_email on portal_pro_relationship_records.
--
-- An earlier iteration backfilled related_user_id from row_data->>'linkedUserId'
-- so an accepted co-manager link would resolve for BOTH participants. That was a
-- mistake: this table is a PER-WRITER mirror — each participant's row holds that
-- writer's own perspective (linkDirection, linkedAxisId, permissions). Letting the
-- counterpart read a row via related_user_id fed a co-manager's "incoming" row back
-- to the primary manager, who then mis-derived themselves as a co-manager and lost
-- the Co-managers nav section. Cross-participant reads are unnecessary — the
-- relationships page reads the authoritative /api/pro/account-links and inbox scope
-- reads account_link_invites — so each user must read only their OWN mirror rows.
--
-- This restores the original always-null state (the columns were never populated
-- before that iteration), so the GET scope matches solely on manager_user_id.
update public.portal_pro_relationship_records
set related_user_id = null,
    related_email = null
where related_user_id is not null
   or related_email is not null;
