-- Vendor-agent contact fields on profiles: preferred conversation/UI language,
-- SMS consent (vendor granted in settings; a manager can never consent for
-- them), and STOP opt-out (set by the Twilio inbound webhook). Consent and
-- opt-out are distinct timestamps on purpose.
alter table public.profiles
  add column if not exists preferred_language text,
  add column if not exists sms_consent_at timestamptz,
  add column if not exists sms_opt_out_at timestamptz;
