-- Prevent two pending tour requests from holding the same manager/time slot,
-- even when the requests are for different houses.
create unique index if not exists portal_schedule_tour_manager_slot_unique
  on public.portal_schedule_records (manager_user_id, starts_at)
  where record_type = 'partner_inquiry_request'
    and manager_user_id is not null
    and starts_at is not null;
