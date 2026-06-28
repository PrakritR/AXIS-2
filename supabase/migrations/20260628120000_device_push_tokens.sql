-- Device push tokens for the Axis native apps (iOS/Android via Capacitor).
-- One row per device token, re-assigned to whichever user signs in on that
-- device. Notifications are delivered through Firebase Cloud Messaging.

create table if not exists public.device_push_tokens (
  token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists device_push_tokens_user_idx
  on public.device_push_tokens (user_id);

-- Fast lookup of a user's still-active tokens when sending a push.
create index if not exists device_push_tokens_active_idx
  on public.device_push_tokens (user_id)
  where disabled_at is null;

-- Service-role only (matches the other portal tables): RLS on, no policies.
alter table public.device_push_tokens enable row level security;
