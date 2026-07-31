-- Production is missing two PRIVATE storage buckets that deployed code already writes to.
-- `application-documents` is a LIVE break: the rental application's ID photo and
-- proof-of-income uploads fail in production right now.
--
-- Run against the PRODUCTION Supabase project (qahnczmilgptcedaqype) only.
-- Easiest path: Supabase dashboard -> project `prop-lane production` -> SQL Editor -> paste -> Run.
--
-- Idempotent: safe to run more than once, and safe to run against dev (where both already
-- exist) because every insert is `on conflict do update` and every drop is `if exists`.
--
-- Source migrations, unchanged:
--   supabase/migrations/20260727120000_application_documents_bucket.sql
--   supabase/migrations/20260728120000_lease_templates_bucket.sql

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'application-documents',
  'application-documents',
  false,
  15728640, -- 15 MB per file
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "application_documents_no_client_access" on storage.objects;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lease-templates',
  'lease-templates',
  false,
  8388608, -- 8 MB, matching LEASE_TEMPLATE_MAX_BYTES in the client
  array['application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "lease_templates_no_client_access" on storage.objects;

-- Neither bucket gets a permissive object policy, on purpose. Storage RLS default-denies
-- `anon` / `authenticated` when no policy grants them, so the shipped public anon key cannot
-- reach these objects even though the PostgREST surface is browser-reachable. The only way in
-- is the service-role client inside the authorizing routes
-- (`/api/portal/application-photos`, `/api/portal/lease-template`).

-- Verify: expect two rows, both with public = false.
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('application-documents', 'lease-templates')
order by id;
