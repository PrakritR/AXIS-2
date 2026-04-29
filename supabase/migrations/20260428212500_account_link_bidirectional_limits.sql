-- Treat account links as one relationship for both participants, regardless of
-- which workspace sent the invite.
update public.account_link_invites as duplicate
set status = 'cancelled',
    responded_at = coalesce(duplicate.responded_at, now())
from (
  select
    id,
    row_number() over (
      partition by tab_kind, least(inviter_user_id, invitee_user_id), greatest(inviter_user_id, invitee_user_id)
      order by
        case status when 'accepted' then 0 else 1 end,
        responded_at desc nulls last,
        created_at desc,
        id desc
    ) as duplicate_rank
  from public.account_link_invites
  where status in ('pending', 'accepted')
) as ranked
where duplicate.id = ranked.id
  and ranked.duplicate_rank > 1;

create unique index if not exists account_link_invites_unique_active_pair
  on public.account_link_invites (
    tab_kind,
    least(inviter_user_id, invitee_user_id),
    greatest(inviter_user_id, invitee_user_id)
  )
  where status in ('pending', 'accepted');
