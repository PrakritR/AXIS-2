-- Cross-workspace account link invites (owner tab ↔ owner, manager tab ↔ manager).

create table if not exists public.account_link_invites (
  id uuid primary key default gen_random_uuid(),
  inviter_user_id uuid not null references auth.users (id) on delete cascade,
  invitee_user_id uuid not null references auth.users (id) on delete cascade,
  tab_kind text not null check (tab_kind in ('owner', 'manager')),
  inviter_axis_id text not null,
  invitee_axis_id text not null,
  inviter_display_name text,
  invitee_display_name text,
  assigned_property_ids jsonb not null default '[]'::jsonb,
  payout_percent_for_manager numeric not null default 15
    check (payout_percent_for_manager >= 0 and payout_percent_for_manager <= 100),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint account_link_invites_no_self check (inviter_user_id <> invitee_user_id)
);

create index if not exists account_link_invites_invitee_idx
  on public.account_link_invites (invitee_user_id, status);
create index if not exists account_link_invites_inviter_idx
  on public.account_link_invites (inviter_user_id, status);

-- One pending invite per inviter + invitee + tab (allows same pair on both tabs).
create unique index if not exists account_link_invites_unique_pending
  on public.account_link_invites (inviter_user_id, invitee_user_id, tab_kind)
  where status = 'pending';

alter table public.account_link_invites enable row level security;

drop policy if exists "account_link_invites_select_participants" on public.account_link_invites;
create policy "account_link_invites_select_participants"
  on public.account_link_invites for select
  using (auth.uid() = inviter_user_id or auth.uid() = invitee_user_id);

-- Inserts and updates run from API routes with the service role only (RLS bypassed).
