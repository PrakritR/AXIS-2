-- Manager-owned codes that waive the rental application fee. A manager
-- creates/revokes their own codes from their portal; an applicant who enters
-- a valid one pays no application fee at all (no Stripe session is ever
-- created for a waived fee — this table only records the waiver decision).
--
-- Security boundary: every lookup and mutation is scoped on
-- (manager_user_id, code) — never on `code` alone — so one manager's code can
-- never match another manager's property. Written via the service role only
-- (same posture as `agent_pending_actions`); no anon/authenticated grants, so
-- a client-side-only check is structurally impossible.
create table if not exists public.manager_application_fee_waiver_codes (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null,
  code text not null,
  -- Uppercased, whitespace-trimmed form of `code` — every lookup and the
  -- uniqueness constraint key off this column so "abc123" and "ABC123" are
  -- the same code.
  code_normalized text not null,
  label text,
  status text not null default 'active', -- active | revoked
  -- null = unlimited uses (the reusable default). A manager may cap it.
  max_uses integer,
  used_count integer not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint manager_application_fee_waiver_codes_status_check
    check (status in ('active', 'revoked')),
  constraint manager_application_fee_waiver_codes_max_uses_check
    check (max_uses is null or max_uses > 0)
);

-- Scopes uniqueness to the manager: two different managers may each own a
-- code spelled "FREE100" without colliding.
create unique index if not exists manager_application_fee_waiver_codes_manager_code_idx
  on public.manager_application_fee_waiver_codes (manager_user_id, code_normalized);

create index if not exists manager_application_fee_waiver_codes_manager_status_idx
  on public.manager_application_fee_waiver_codes (manager_user_id, status);

alter table public.manager_application_fee_waiver_codes enable row level security;

-- Records which code waived which application, so a manager can see why an
-- applicant paid nothing. One row per successful redemption (a reusable code
-- accumulates many rows).
create table if not exists public.application_fee_waiver_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.manager_application_fee_waiver_codes (id) on delete cascade,
  -- Denormalized copy of the code's manager, so a manager's redemption history
  -- can be queried without joining back through the code row.
  manager_user_id uuid not null,
  property_id text not null,
  resident_email text not null,
  application_id text,
  redeemed_at timestamptz not null default now()
);

create index if not exists application_fee_waiver_redemptions_code_idx
  on public.application_fee_waiver_redemptions (code_id);
create index if not exists application_fee_waiver_redemptions_manager_idx
  on public.application_fee_waiver_redemptions (manager_user_id, redeemed_at desc);

alter table public.application_fee_waiver_redemptions enable row level security;

-- Atomic validate-and-redeem: increments `used_count` and inserts the
-- redemption row in ONE statement, so two concurrent applicants can never
-- both win the last use of a limited-use code (a plain read-then-write from
-- application code would have exactly that race). Returns the redeemed
-- code's id, or no rows at all when the code is inactive, expired, exhausted,
-- or does not belong to the given manager.
create or replace function public.redeem_application_fee_waiver_code(
  p_code_id uuid,
  p_manager_user_id uuid,
  p_property_id text,
  p_resident_email text,
  p_application_id text
) returns table (id uuid) as $$
declare
  v_id uuid;
begin
  update public.manager_application_fee_waiver_codes
  set used_count = used_count + 1
  where manager_application_fee_waiver_codes.id = p_code_id
    and manager_user_id = p_manager_user_id
    and status = 'active'
    and (expires_at is null or expires_at > now())
    and (max_uses is null or used_count < max_uses)
  returning manager_application_fee_waiver_codes.id into v_id;

  if v_id is null then
    return;
  end if;

  insert into public.application_fee_waiver_redemptions
    (code_id, manager_user_id, property_id, resident_email, application_id)
  values (p_code_id, p_manager_user_id, p_property_id, p_resident_email, p_application_id);

  id := v_id;
  return next;
end;
$$ language plpgsql;

-- Callable only via the service role (application code never grants this to
-- anon/authenticated), mirroring the "no direct client write" posture above.
revoke all on function public.redeem_application_fee_waiver_code(uuid, uuid, text, text, text) from public, anon, authenticated;
