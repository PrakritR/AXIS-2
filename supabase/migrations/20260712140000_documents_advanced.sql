-- Documents Phases 4-7: templates, e-signature metadata, auto-file settings column.

create table if not exists public.manager_document_templates (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  category text not null default 'notice' check (
    category in ('lease', 'insurance', 'tax', 'notice', 'invoice', 'inspection', 'photo', 'other')
  ),
  body_html text not null,
  merge_fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists manager_document_templates_manager_idx
  on public.manager_document_templates (manager_user_id);

alter table public.manager_documents
  add column if not exists signature_status text check (
    signature_status is null or signature_status in ('pending', 'signed', 'declined')
  ),
  add column if not exists signed_at timestamptz,
  add column if not exists signature_requested_at timestamptz;

alter table public.manager_automation_settings
  add column if not exists document_auto_file jsonb not null default '{}'::jsonb;

alter table public.manager_document_templates enable row level security;

drop policy if exists manager_document_templates_owner on public.manager_document_templates;
create policy manager_document_templates_owner on public.manager_document_templates
  for all using (manager_user_id = auth.uid());
