-- Move vendor compliance docs and bug-feedback attachments out of the PUBLIC
-- `listing-photos` bucket. Listing photos stay public; these paths are private
-- and reachable only through service-role API routes after an auth check.

-- Vendor compliance documents (insurance, license, W-9). Paths stay
-- `vendor-documents/<vendor_user_id>/...` — the same prefix already stored in
-- manager_vendor_records.row_data.vendorDocuments[].storagePath.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vendor-documents',
  'vendor-documents',
  false,
  5242880, -- 5 MB — matches the upload route cap
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "vendor_documents_owner_objects" on storage.objects;
create policy "vendor_documents_owner_objects"
  on storage.objects for all
  using (
    bucket_id = 'vendor-documents'
    and (storage.foldername(name))[1] = 'vendor-documents'
    and auth.uid()::text = (storage.foldername(name))[2]
  )
  with check (
    bucket_id = 'vendor-documents'
    and (storage.foldername(name))[1] = 'vendor-documents'
    and auth.uid()::text = (storage.foldername(name))[2]
  );

-- Bug/feedback screenshot attachments. Paths are `bug-feedback/<user_id>/...`.
-- Default-deny (no client policy): reporters and admins reach bytes only via
-- `/api/bug-feedback-attachments`, mirroring `application-documents`.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bug-feedback-attachments',
  'bug-feedback-attachments',
  false,
  5242880, -- 5 MB — matches the upload route cap
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "bug_feedback_attachments_no_client_access" on storage.objects;
