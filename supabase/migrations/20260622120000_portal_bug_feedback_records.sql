-- Bug reports and product feedback from portal users (managers, residents, owners).

create table if not exists public.portal_bug_feedback_records (
  id text primary key,
  reporter_user_id uuid,
  reporter_email text,
  reporter_role text,
  report_type text not null default 'bug',
  row_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_bug_feedback_records_reporter_user_idx
  on public.portal_bug_feedback_records (reporter_user_id);

create index if not exists portal_bug_feedback_records_reporter_email_idx
  on public.portal_bug_feedback_records (lower(reporter_email));

create index if not exists portal_bug_feedback_records_report_type_idx
  on public.portal_bug_feedback_records (report_type, updated_at desc);

alter table public.portal_bug_feedback_records enable row level security;
