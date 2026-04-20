-- Multiple portal roles per user (same auth user can access more than one portal).

create table if not exists public.profile_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('resident', 'manager', 'owner', 'admin')),
  primary key (user_id, role)
);

create index if not exists profile_roles_user_idx on public.profile_roles (user_id);

alter table public.profile_roles enable row level security;

drop policy if exists "profile_roles_select_self" on public.profile_roles;
create policy "profile_roles_select_self" on public.profile_roles for select using (auth.uid() = user_id);

drop policy if exists "profile_roles_insert_self" on public.profile_roles;
create policy "profile_roles_insert_self" on public.profile_roles for insert with check (auth.uid() = user_id);

drop policy if exists "profile_roles_delete_self" on public.profile_roles;
create policy "profile_roles_delete_self" on public.profile_roles for delete using (auth.uid() = user_id);

-- Backfill from legacy single role on profiles
insert into public.profile_roles (user_id, role)
select id, role from public.profiles
on conflict do nothing;
