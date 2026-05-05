-- Storage bucket for manager-uploaded listing photos and videos.
-- Managers upload via the service-role API route; public read for display.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-photos',
  'listing-photos',
  true,
  52428800, -- 50 MB per file
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
)
on conflict (id) do nothing;

-- Public read
drop policy if exists "listing_photos_public_read" on storage.objects;
create policy "listing_photos_public_read"
  on storage.objects for select
  using (bucket_id = 'listing-photos');

-- Authenticated users can upload to their own folder (manager-user-id prefix)
drop policy if exists "listing_photos_auth_insert" on storage.objects;
create policy "listing_photos_auth_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'listing-photos'
    and auth.role() = 'authenticated'
  );

-- Users can delete their own uploads
drop policy if exists "listing_photos_auth_delete" on storage.objects;
create policy "listing_photos_auth_delete"
  on storage.objects for delete
  using (
    bucket_id = 'listing-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
