-- Harden phone verification + inbound webhook against brute-force and retries.

-- Absolute send cap (does NOT reset on resend, unlike `attempts`) and window.
alter table public.phone_verifications
  add column if not exists send_count integer not null default 0,
  add column if not exists first_sent_at timestamptz;

-- Idempotency: Twilio retries the webhook on any non-2xx/timeout. A unique
-- message_sid lets the handler skip already-processed inbound texts (no
-- duplicate inbox threads / emails / forward SMS).
create unique index if not exists inbound_sms_log_message_sid_uniq
  on public.inbound_sms_log (message_sid)
  where message_sid is not null;
