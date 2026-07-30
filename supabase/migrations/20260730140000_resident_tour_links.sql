-- Tour inquiry ↔ resident account links (record-based, not email-only identity).
-- Service-role writes only; RLS enabled with no client policies.

create table if not exists public.resident_tour_links (
  id uuid primary key default gen_random_uuid(),
  resident_user_id uuid not null references auth.users (id) on delete cascade,
  inquiry_id text not null,
  tour_group_id text,
  manager_user_id uuid references auth.users (id) on delete set null,
  property_id text,
  attendee_email text not null,
  linked_at timestamptz not null default now(),
  unique (resident_user_id, inquiry_id)
);

create index if not exists resident_tour_links_user_idx
  on public.resident_tour_links (resident_user_id, linked_at desc);

create index if not exists resident_tour_links_inquiry_idx
  on public.resident_tour_links (inquiry_id);

alter table public.resident_tour_links enable row level security;
