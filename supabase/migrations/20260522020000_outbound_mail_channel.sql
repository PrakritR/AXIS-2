ALTER TABLE portal_outbound_mail_records ADD COLUMN IF NOT EXISTS channel text DEFAULT 'email';
