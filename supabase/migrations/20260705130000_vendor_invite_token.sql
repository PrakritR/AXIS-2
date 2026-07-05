-- Security hardening for vendor invite links: a signed, single-use, expiring
-- token replaces the bare ?email= query param that a caller could previously
-- spoof to hijack another vendor's invite (see provisionVendorAccountByEmail).

ALTER TABLE vendor_invites
  ADD COLUMN IF NOT EXISTS invite_token text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS vendor_invites_token_idx
  ON vendor_invites (invite_token)
  WHERE invite_token IS NOT NULL;
