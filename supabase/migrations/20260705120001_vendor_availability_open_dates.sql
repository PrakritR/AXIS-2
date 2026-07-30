-- Vendor portal: let a vendor open a specific one-off date (positive
-- availability), not just weekly recurring hours. A vendor with zero weekly
-- windows previously had no way to surface any bookable slot. Adds a third
-- `kind = 'open'` alongside the existing 'weekly' (recurring) and 'block'
-- (subtract-only) rows, reusing the same `specific_date` + start/end minute
-- columns 'block' already has.

alter table public.vendor_availability_rules
  drop constraint if exists vendor_availability_rules_kind_check;
alter table public.vendor_availability_rules
  add constraint vendor_availability_rules_kind_check check (kind in ('weekly', 'block', 'open'));

alter table public.vendor_availability_rules
  drop constraint if exists vendor_availability_rules_shape;
alter table public.vendor_availability_rules
  add constraint vendor_availability_rules_shape check (
    (kind = 'weekly' and weekday is not null and specific_date is null)
    or (kind = 'block' and specific_date is not null and weekday is null)
    or (kind = 'open' and specific_date is not null and weekday is null)
  );
