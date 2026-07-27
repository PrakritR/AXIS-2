-- Private storage bucket for applicant-uploaded ID photos and proof-of-income
-- documents (rental application, Signer Information + Employment steps).
--
-- These images are among the most sensitive data the product holds — a driver's
-- license photo carries a face, home address, date of birth and license number
-- in one frame, and it sits beside the Social Security number collected on the
-- same step. So the bucket is PRIVATE: bytes are never public and never fetched
-- from a guessable URL. All access runs through the service-role API routes
-- (`/api/portal/application-photos`), which re-authorize EVERY request — only
-- the applicant and the manager who received that application may read a photo.
--
-- There is deliberately NO metadata table: the object-path reference lives on
-- the application answers (`row_data.application.idPhotoFront` etc. in
-- `manager_application_records`), so it persists and resumes through the same
-- autosave path as every other answer. Ownership is therefore always derived
-- from the owning application row at request time, never trusted from the client.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'application-documents',
  'application-documents',
  false,
  15728640, -- 15 MB per file
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'application/pdf'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No permissive object policy is created on purpose. Storage RLS denies the
-- `anon` / `authenticated` roles by default when no policy grants them access,
-- so a leaked public anon key cannot read, list, or write these objects. The
-- only path in is the service-role client inside the authorized routes. (Unlike
-- `manager-documents`, we cannot fold a defense-in-depth `auth.uid()` folder
-- policy here because an applicant may be an unauthenticated guest at upload
-- time, so there is no uid to scope the folder to. Default-deny is stricter.)
drop policy if exists "application_documents_no_client_access" on storage.objects;
