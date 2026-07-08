-- Public share links for manager documents (AXI-85).
-- Token-based, expiring, revocable links so files stay on-platform.

CREATE TABLE IF NOT EXISTS document_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES manager_documents(id) ON DELETE CASCADE,
  manager_user_id uuid NOT NULL,
  share_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  access_count integer NOT NULL DEFAULT 0,
  last_accessed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS document_share_links_token_idx
  ON document_share_links (share_token)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS document_share_links_document_idx
  ON document_share_links (document_id);

ALTER TABLE document_share_links ENABLE ROW LEVEL SECURITY;
