-- Co-signer submissions linked to primary rental applications.

create table if not exists public.cosigner_submission_records (
  id text primary key,
  signer_app_id text not null,
  manager_user_id uuid,
  row_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cosigner_submission_records_signer_app_idx
  on public.cosigner_submission_records (signer_app_id);

create index if not exists cosigner_submission_records_manager_idx
  on public.cosigner_submission_records (manager_user_id);

alter table public.cosigner_submission_records enable row level security;
