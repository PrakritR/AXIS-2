-- Document library foundation (Documents module Phase 1).
--
-- A general-purpose, manager-owned document store — distinct from the
-- ephemeral generated tax/financial PDFs. Files live in a PRIVATE storage
-- bucket; the table holds metadata, polymorphic scope, soft-delete, and simple
-- versioning. Only manager-level rows/UI ship this phase; the resident/vendor
-- visibility, expiration/compliance, and versioning-UI columns are provisioned
-- now so later phases (sharing, compliance reminders, e-signature) need no
-- further migration.

create table if not exists public.manager_documents (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null references auth.users (id) on delete cascade,

  -- File metadata
  display_name text not null,
  original_filename text,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  checksum text,
  storage_path text not null unique,

  category text not null default 'other'
    check (category in ('lease', 'insurance', 'tax', 'notice', 'invoice', 'inspection', 'photo', 'other')),

  -- Polymorphic scope. All nullable; a row with no scope columns set is a
  -- manager-level document. These match the loosely-typed identifier columns
  -- used across ledger_entries / manager_expense_entries / vendor tables
  -- (property/vendor/work-order/lease are app-level text ids, not FKs).
  property_id text,
  unit_label text,
  lease_id text,
  resident_user_id uuid references auth.users (id) on delete set null,
  resident_email text,
  vendor_id text,
  work_order_id text,

  -- Only 'manager' is used this phase; 'resident'/'vendor' land in Phase 2.
  visibility text not null default 'manager'
    check (visibility in ('manager', 'resident', 'vendor')),

  -- Phase 3 (compliance/expiration) — column now, UI later.
  expires_at timestamptz,

  -- Simple versioning: a superseding document points back at the one it replaced.
  superseded_by_document_id uuid references public.manager_documents (id) on delete set null,

  uploaded_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes on manager_user_id + the scope columns, partial on live rows since
-- every list query excludes soft-deleted documents.
create index if not exists manager_documents_manager_idx
  on public.manager_documents (manager_user_id) where deleted_at is null;
create index if not exists manager_documents_property_idx
  on public.manager_documents (manager_user_id, property_id) where deleted_at is null;
create index if not exists manager_documents_lease_idx
  on public.manager_documents (manager_user_id, lease_id) where deleted_at is null;
create index if not exists manager_documents_resident_idx
  on public.manager_documents (manager_user_id, resident_user_id) where deleted_at is null;
create index if not exists manager_documents_vendor_idx
  on public.manager_documents (manager_user_id, vendor_id) where deleted_at is null;
create index if not exists manager_documents_work_order_idx
  on public.manager_documents (manager_user_id, work_order_id) where deleted_at is null;

-- RLS: manager owns only their own rows (defense-in-depth; real access goes
-- through the service-role API routes). No resident/vendor policies yet —
-- those arrive with Phase 2 sharing.
alter table public.manager_documents enable row level security;

drop policy if exists manager_documents_owner on public.manager_documents;
create policy manager_documents_owner on public.manager_documents
  for all using (manager_user_id = auth.uid())
  with check (manager_user_id = auth.uid());

-- Private storage bucket for uploaded documents. Never public: access is only
-- via server-generated signed URLs after an ownership check. Paths are
-- namespaced `manager/<manager_user_id>/...`.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'manager-documents',
  'manager-documents',
  false,
  26214400, -- 25 MB per file
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', -- .docx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       -- .xlsx
    'application/msword',                                                      -- .doc
    'application/vnd.ms-excel'                                                 -- .xls
  ]
)
on conflict (id) do nothing;

-- Defense-in-depth object policy: an authenticated user may only touch objects
-- under their own `manager/<uid>/` prefix. Uploads/reads/deletes actually run
-- through the service-role client (which bypasses RLS), so this only hardens
-- against a leaked anon/authenticated key.
drop policy if exists "manager_documents_owner_objects" on storage.objects;
create policy "manager_documents_owner_objects"
  on storage.objects for all
  using (
    bucket_id = 'manager-documents'
    and auth.uid()::text = (storage.foldername(name))[2]
  )
  with check (
    bucket_id = 'manager-documents'
    and auth.uid()::text = (storage.foldername(name))[2]
  );
