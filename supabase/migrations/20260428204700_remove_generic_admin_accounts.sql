-- Keep a single admin identity and remove legacy/generic admin records.

delete from public.portal_schedule_records
where record_type = 'admin_availability'
  and (
    manager_user_id is null
    or id = 'axis_admin_avail_slots_v2'
    or lower(coalesce(row_data->>'adminLabel', '')) not in ('', 'prakritramachandran@gmail.com')
  );

delete from public.profile_roles pr
using public.profiles p
where pr.user_id = p.id
  and pr.role = 'admin'
  and lower(coalesce(p.email, '')) <> 'prakritramachandran@gmail.com';

delete from auth.users u
using public.profiles p
where u.id = p.id
  and p.role = 'admin'
  and lower(coalesce(p.email, u.email, '')) <> 'prakritramachandran@gmail.com';

update public.profiles
set role = 'admin',
    updated_at = now()
where lower(coalesce(email, '')) = 'prakritramachandran@gmail.com';

insert into public.profile_roles (user_id, role)
select id, 'admin'
from public.profiles
where lower(coalesce(email, '')) = 'prakritramachandran@gmail.com'
on conflict do nothing;
