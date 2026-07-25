-- Per-manager SMS number provisioning + registration state machine.
--
-- Background: every manager gets exactly ONE personal SMS number, auto-created
-- at signup and used for all inbound/outbound. `profiles.sms_from_number` is the
-- denormalized "active number" cache every existing send/inbound path already
-- reads; THIS table is the source of truth for the number's LIFECYCLE STATE
-- (provider ids, provisioning progress, retry/error, timestamps) plus the
-- per-manager MESSAGING REGISTRATION state (the ISV/reseller model: a manager's
-- number can exist but stay unable to send until that manager's own A2P/brand
-- registration clears).
--
-- Service-role only, exactly like inbound_sms_log / sms_consent: RLS is enabled
-- with NO policies so anon/authenticated PostgREST access is default-denied. The
-- webhooks, crons and provisioning code write it with the service-role client.

create table if not exists public.manager_sms_numbers (
  manager_user_id uuid primary key references auth.users (id) on delete cascade,

  -- Provider identity of the purchased number (null until actually bought).
  phone_number          text,
  phone_number_sid      text,
  messaging_service_sid text,
  provider              text not null default 'twilio',
  area_code             text,

  -- Number lifecycle:
  --   pending_registration | provisioning | active | failed | released
  provision_state text not null default 'pending_registration',

  -- Per-manager messaging registration (ISV/reseller model):
  --   pending | approved | rejected
  -- A single shared registration is modelled by pointing many managers'
  -- registration_ref at one shared record and flipping it once (see
  -- effectiveRegistrationState / SMS_SHARED_REGISTRATION_* in the app layer).
  registration_state text not null default 'pending',
  registration_ref   text,

  -- Retry / observability for the provisioning attempt.
  attempts   integer not null default 0,
  last_error text,

  requested_at            timestamptz not null default now(),
  provisioned_at          timestamptz,
  released_at             timestamptz,
  registration_updated_at timestamptz,
  updated_at              timestamptz not null default now()
);

-- A phone number belongs to exactly one manager while it is in use. Released
-- rows keep their number for history/audit and are excluded so a reassigned
-- number never collides.
create unique index if not exists manager_sms_numbers_phone_uniq
  on public.manager_sms_numbers (phone_number)
  where phone_number is not null and provision_state <> 'released';

-- Sweep helper: find managers still waiting on a number / registration.
create index if not exists manager_sms_numbers_provision_state_idx
  on public.manager_sms_numbers (provision_state);
create index if not exists manager_sms_numbers_registration_state_idx
  on public.manager_sms_numbers (registration_state);

alter table public.manager_sms_numbers enable row level security;
-- No policies on purpose: default-deny for anon/authenticated PostgREST.
