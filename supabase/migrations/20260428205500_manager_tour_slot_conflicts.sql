-- Prevent two pending tour requests from holding the same manager/time slot,
-- even when the requests are for different houses.
delete from public.portal_schedule_records as duplicate
using (
  select
    id,
    row_number() over (
      partition by manager_user_id, starts_at
      order by updated_at desc, created_at desc, id desc
    ) as duplicate_rank
  from public.portal_schedule_records
  where record_type = 'partner_inquiry_request'
    and manager_user_id is not null
    and starts_at is not null
) as ranked
where duplicate.id = ranked.id
  and ranked.duplicate_rank > 1;

create unique index if not exists portal_schedule_tour_manager_slot_unique
  on public.portal_schedule_records (manager_user_id, starts_at)
  where record_type = 'partner_inquiry_request'
    and manager_user_id is not null
    and starts_at is not null;
