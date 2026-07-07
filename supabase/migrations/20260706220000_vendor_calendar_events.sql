-- Vendor calendar: manually logged work blocks (jobs, appointments) that appear on
-- the vendor calendar and count as busy for auto-scheduling.

alter table public.vendor_availability_rules
  drop constraint if exists vendor_availability_rules_kind_check;
alter table public.vendor_availability_rules
  add constraint vendor_availability_rules_kind_check check (kind in ('weekly', 'block', 'open', 'event'));

alter table public.vendor_availability_rules
  drop constraint if exists vendor_availability_rules_shape;
alter table public.vendor_availability_rules
  add constraint vendor_availability_rules_shape check (
    (kind = 'weekly' and weekday is not null and specific_date is null)
    or (kind in ('block', 'open', 'event') and specific_date is not null and weekday is null)
  );
