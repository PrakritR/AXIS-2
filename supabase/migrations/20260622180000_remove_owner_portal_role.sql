-- Migrate deprecated owner portal role to manager and remove owner from allowed role values.

UPDATE profile_roles SET role = 'manager' WHERE role = 'owner';
UPDATE profiles SET role = 'manager' WHERE role = 'owner';

UPDATE account_link_invites SET tab_kind = 'manager' WHERE tab_kind = 'owner';

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'manager', 'resident'));

ALTER TABLE profile_roles DROP CONSTRAINT IF EXISTS profile_roles_role_check;
ALTER TABLE profile_roles ADD CONSTRAINT profile_roles_role_check
  CHECK (role IN ('admin', 'manager', 'resident'));

ALTER TABLE account_link_invites DROP CONSTRAINT IF EXISTS account_link_invites_tab_kind_check;
ALTER TABLE account_link_invites ADD CONSTRAINT account_link_invites_tab_kind_check
  CHECK (tab_kind IN ('manager'));

ALTER TABLE profiles DROP COLUMN IF EXISTS payout_splits_config;
