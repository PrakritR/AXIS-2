-- The shared Claw agent line is retired. Managers use their own registered
-- work number; remove the legacy shared number from existing profiles so it
-- disappears from Communication, Settings, and public listing resolution.
update public.profiles
set sms_from_number = null,
    updated_at = now()
where regexp_replace(coalesce(sms_from_number, ''), '[^0-9]', '', 'g') in (
  '12053690702',
  '2053690702'
);
