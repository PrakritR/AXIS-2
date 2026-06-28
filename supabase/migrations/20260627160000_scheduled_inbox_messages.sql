-- Manager-composed inbox messages scheduled for future delivery.

create table if not exists public.portal_scheduled_inbox_message_records (
  id text primary key,
  manager_user_id uuid not null,
  send_at timestamptz not null,
  status text not null default 'scheduled',
  row_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_scheduled_inbox_message_manager_idx
  on public.portal_scheduled_inbox_message_records (manager_user_id, send_at);

create index if not exists portal_scheduled_inbox_message_due_idx
  on public.portal_scheduled_inbox_message_records (status, send_at);

alter table public.portal_scheduled_inbox_message_records enable row level security;
