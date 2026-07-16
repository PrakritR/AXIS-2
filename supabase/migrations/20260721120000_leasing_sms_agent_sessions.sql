-- Leasing SMS agent: one Claude conversation per (manager work-number owner, prospect phone).
-- Reuses vendor_phone_e164 as the external counterparty phone (prospect here, vendor elsewhere).
create index if not exists agent_sessions_leasing_phone_idx
  on public.agent_sessions (landlord_id, vendor_phone_e164, updated_at desc)
  where kind = 'leasing_sms';

-- Application code finds-or-creates; this partial unique prevents duplicate threads.
create unique index if not exists agent_sessions_leasing_mgr_phone_uidx
  on public.agent_sessions (landlord_id, vendor_phone_e164)
  where kind = 'leasing_sms' and vendor_phone_e164 is not null;
