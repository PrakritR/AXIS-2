-- Allow a `draft` status on manager property records so a manager can save an
-- in-progress "add property" wizard and return to finish it later. A draft is
-- private to its owner (the existing RLS `select_own` policy already covers it —
-- only `status = 'live'` is publicly selectable, so drafts never leak to
-- prospects) and is never published until the manager finishes the wizard.
alter table public.manager_property_records
  drop constraint if exists manager_property_records_status_check;

alter table public.manager_property_records
  add constraint manager_property_records_status_check
  check (status in ('pending', 'live', 'review', 'request_change', 'unlisted', 'rejected', 'draft'));
