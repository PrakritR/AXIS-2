-- Private storage bucket for manager-uploaded lease template PDFs.
--
-- A lease template is the manager's own legal document: often their attorney's
-- work product, carrying their entity name, their terms, and sometimes their
-- signature block. It was previously uploaded to the PUBLIC `listing-photos`
-- bucket alongside listing photos, so the object sat at an unauthenticated URL
-- and that URL shipped inside `/api/property-records/public` for every live
-- listing. Photos are public on purpose; this document is not.
--
-- Like `application-documents`, there is deliberately NO metadata table: the
-- object path reference lives on the listing submission
-- (`manager_property_records.property_data.listingSubmission.leaseTemplateDocUrl`
-- and the same field inside `propertyLeaseTemplates[]`), so it persists through
-- the same draft/autosave path as every other listing field. Ownership is
-- therefore derived from the owning property record at request time, never
-- trusted from the client. Bytes flow only through
-- `/api/portal/lease-template`, which re-authorizes EVERY request.

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

-- No permissive object policy is created on purpose. Storage RLS denies the
-- `anon` / `authenticated` roles by default when no policy grants them access,
-- so the shipped public anon key cannot read, list, or write these objects even
-- though the PostgREST surface is reachable from a browser console. The only
-- path in is the service-role client inside the authorized route. A folder-scoped
-- `auth.uid()` policy would be strictly weaker here, because a resident who may
-- read their own lease template is not the folder owner.
drop policy if exists "lease_templates_no_client_access" on storage.objects;
