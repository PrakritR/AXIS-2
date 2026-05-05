-- Remove MIME type restriction so all video/image formats are accepted.
-- Remove the file size cap so large videos are not rejected at the bucket level.
-- RLS policies already scope access to authenticated users only.
update storage.buckets
set
  file_size_limit   = null,
  allowed_mime_types = null
where id = 'listing-photos';
