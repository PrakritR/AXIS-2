-- Vendor portal Phase 1 foundation: vendor role, invite links, vendor-scoped RLS.

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'manager', 'resident', 'vendor'));

ALTER TABLE profile_roles DROP CONSTRAINT IF EXISTS profile_roles_role_check;
ALTER TABLE profile_roles ADD CONSTRAINT profile_roles_role_check
  CHECK (role IN ('admin', 'manager', 'resident', 'vendor'));

-- Link vendor directory rows, work orders, and tax profiles to the vendor's own
-- auth user once they accept an invite and sign up, so RLS can scope by auth.uid().
ALTER TABLE manager_vendor_records
  ADD COLUMN IF NOT EXISTS vendor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS manager_vendor_records_vendor_user_idx
  ON manager_vendor_records (vendor_user_id);

ALTER TABLE portal_work_order_records
  ADD COLUMN IF NOT EXISTS vendor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS portal_work_order_records_vendor_user_idx
  ON portal_work_order_records (vendor_user_id);

ALTER TABLE vendor_tax_profiles
  ADD COLUMN IF NOT EXISTS vendor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS vendor_tax_profiles_vendor_user_idx
  ON vendor_tax_profiles (vendor_user_id);

-- Manager-initiated vendor invites, matched by email at signup (mirrors how
-- manager_application_records matches residents by resident_email — the
-- invitee has no account yet, so this can't use the account_link_invites
-- Axis-ID-lookup shape).
CREATE TABLE IF NOT EXISTS vendor_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  vendor_directory_id text REFERENCES manager_vendor_records (id) ON DELETE SET NULL,
  vendor_email text NOT NULL,
  vendor_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'cancelled')),
  accepted_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz
);

CREATE INDEX IF NOT EXISTS vendor_invites_manager_idx ON vendor_invites (manager_user_id);
CREATE INDEX IF NOT EXISTS vendor_invites_email_idx ON vendor_invites (lower(vendor_email));

ALTER TABLE vendor_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendor_invites_manager_owner ON vendor_invites;
CREATE POLICY vendor_invites_manager_owner ON vendor_invites
  FOR ALL USING (manager_user_id = auth.uid())
  WITH CHECK (manager_user_id = auth.uid());

-- Vendor-scoped read access on vendor-visible rows (defense in depth; today's
-- API routes also scope via service-role, matching the manager_vendor_records /
-- portal_work_order_records "client access goes through service-role API
-- routes" convention, but a directly-queried vendor client must be provably
-- isolated per AGENTS.md row-level-isolation requirement).
DROP POLICY IF EXISTS manager_vendor_records_vendor_read ON manager_vendor_records;
CREATE POLICY manager_vendor_records_vendor_read ON manager_vendor_records
  FOR SELECT USING (vendor_user_id = auth.uid());

DROP POLICY IF EXISTS portal_work_order_records_vendor_read ON portal_work_order_records;
CREATE POLICY portal_work_order_records_vendor_read ON portal_work_order_records
  FOR SELECT USING (vendor_user_id = auth.uid());

DROP POLICY IF EXISTS vendor_tax_profiles_vendor_read ON vendor_tax_profiles;
CREATE POLICY vendor_tax_profiles_vendor_read ON vendor_tax_profiles
  FOR SELECT USING (vendor_user_id = auth.uid());
