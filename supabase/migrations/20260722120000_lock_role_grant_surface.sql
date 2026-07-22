-- Security: close the self-service privilege-escalation surface on the three
-- trust tables that `anon` / `authenticated` could write directly through
-- PostgREST (`supabase/config.toml` exposes `public`).
--
-- Root cause, common to all three: the policies constrained only *which row*
-- you may write, never *which column or value*. An RLS `WITH CHECK` on a row
-- predicate cannot express "you may not change this column", so the row
-- predicate was satisfied by the attacker writing their own row — with
-- `role = 'admin'` in it.
--
--   profiles.profiles_update_self       FOR UPDATE USING (auth.uid() = id), WITH CHECK NULL
--   profiles.profiles_insert_self       FOR INSERT WITH CHECK (auth.uid() = id)
--   profile_roles.profile_roles_insert_self / _delete_self   same shape
--   vendor_invites.vendor_invites_manager_owner              FOR ALL (INSERT/UPDATE included)
--
-- Every legitimate writer of these tables is a server route on the
-- service-role client, which bypasses both RLS and these grants. The only
-- browser-client writer was the resident Settings panel, which now goes
-- through `PATCH /api/profile` (auth-checked, then service-role).
--
-- Follows the precedent in 20260705120000_work_order_bids_vendor_select_only.sql:
-- drop the over-broad policy, keep an owner-scoped SELECT, and revoke the DML
-- grant so the policy is not the only thing standing between a browser and the
-- table.
--
-- Every statement here is idempotent. Supabase records migrations under
-- APPLY-TIME versions rather than repo filenames, so this file's recorded
-- version will not match its name and a later `supabase db push --include-all`
-- may replay it.

-- ── profiles ────────────────────────────────────────────────────────────────
-- Reads of your own row stay open (the portal reads `role` / `manager_id` on
-- boot). All writes move server-side.
DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;

REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon, authenticated;

-- ── profile_roles ───────────────────────────────────────────────────────────
-- Role grants are server-side only. `profile_roles_select_self` is kept so a
-- user can still read which portals they have access to.
DROP POLICY IF EXISTS "profile_roles_insert_self" ON public.profile_roles;
DROP POLICY IF EXISTS "profile_roles_delete_self" ON public.profile_roles;

REVOKE INSERT, UPDATE, DELETE ON public.profile_roles FROM anon, authenticated;

-- ── vendor_invites ──────────────────────────────────────────────────────────
-- `FOR ALL` governed INSERT and UPDATE too, and `WITH CHECK (manager_user_id =
-- auth.uid())` is satisfied by any authenticated user naming *themselves* as
-- the manager. That forged a redeemable invite for an arbitrary
-- `vendor_email`, which `/api/auth/vendor-register` turns into a
-- **pre-confirmed** account on an email the attacker does not control.
--
-- UPDATE is revoked as well as INSERT: being able to rewrite `vendor_email` /
-- `invite_token` / `expires_at` on an invite you legitimately own reaches the
-- identical outcome.
DROP POLICY IF EXISTS vendor_invites_manager_owner ON public.vendor_invites;
DROP POLICY IF EXISTS vendor_invites_manager_read ON public.vendor_invites;
CREATE POLICY vendor_invites_manager_read ON public.vendor_invites
  FOR SELECT USING (manager_user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.vendor_invites FROM anon, authenticated;

-- A NULL expiry skipped the TTL check entirely in
-- `src/lib/auth/provision-vendor-account.ts` (`if (invite.expires_at && …)`).
-- The code is now fail-closed as well, but stop NULLs reaching it at all.
-- Existing NULLs are backfilled to created_at + 7 days, matching the TTL the
-- issuing route stamps; already-elapsed values simply read as expired.
UPDATE public.vendor_invites
   SET expires_at = created_at + interval '7 days'
 WHERE expires_at IS NULL;

ALTER TABLE public.vendor_invites
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '7 days');
ALTER TABLE public.vendor_invites
  ALTER COLUMN expires_at SET NOT NULL;
