-- Vendor portal: vendor-set availability, so managers can auto-schedule work
-- order visits into a vendor's open slots instead of only picking a time by
-- hand. Two shapes in one table (kind discriminator): a recurring weekly
-- window ("Mon-Fri 9am-5pm") and a one-off blocked date/time range. Modeled
-- on the work_order_bids migration (vendor_user_id direct FK, vendor owns via
-- RLS, manager gets read-only via a join against manager_vendor_records since
-- availability belongs to the vendor, not to any single manager relationship).

create table if not exists public.vendor_availability_rules (
  id uuid primary key default gen_random_uuid(),
  vendor_user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('weekly', 'block')),
  -- 'weekly': which day this window recurs on, JS Date#getDay() convention (0 = Sunday .. 6 = Saturday).
  weekday smallint check (weekday is null or (weekday between 0 and 6)),
  -- 'block': the specific calendar date (vendor's local date) this row blocks off.
  specific_date date,
  start_minute smallint not null check (start_minute >= 0 and start_minute < 1440),
  end_minute smallint not null check (end_minute > start_minute and end_minute <= 1440),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_availability_rules_shape check (
    (kind = 'weekly' and weekday is not null and specific_date is null)
    or (kind = 'block' and specific_date is not null and weekday is null)
  )
);

create index if not exists vendor_availability_rules_vendor_idx
  on public.vendor_availability_rules (vendor_user_id);

alter table public.vendor_availability_rules enable row level security;

-- The vendor fully owns their own availability rows.
drop policy if exists vendor_availability_rules_vendor_owner on public.vendor_availability_rules;
create policy vendor_availability_rules_vendor_owner on public.vendor_availability_rules
  for all using (vendor_user_id = auth.uid())
  with check (vendor_user_id = auth.uid());

-- A manager may read (never write) availability for any vendor they have a
-- directory relationship with — mirrors manager_vendor_records_vendor_read's
-- auth.uid() pattern but from the manager side, via a join since a vendor's
-- availability isn't scoped to a single manager_user_id column.
drop policy if exists vendor_availability_rules_manager_read on public.vendor_availability_rules;
create policy vendor_availability_rules_manager_read on public.vendor_availability_rules
  for select using (
    exists (
      select 1 from public.manager_vendor_records mvr
      where mvr.vendor_user_id = vendor_availability_rules.vendor_user_id
        and mvr.manager_user_id = auth.uid()
    )
  );
