-- Documents module Phase 2: resident/vendor read access for shared library rows.
-- Real reads still go through service-role API routes; these policies are
-- defense-in-depth for any future direct client queries.

drop policy if exists manager_documents_resident_read on public.manager_documents;
create policy manager_documents_resident_read on public.manager_documents
  for select using (
    deleted_at is null
    and visibility = 'resident'
    and (
      resident_user_id = auth.uid()
      or lower(coalesce(resident_email, '')) = lower(coalesce(
        (select p.email from public.profiles p where p.id = auth.uid()),
        ''
      ))
    )
  );

drop policy if exists manager_documents_vendor_read on public.manager_documents;
create policy manager_documents_vendor_read on public.manager_documents
  for select using (
    deleted_at is null
    and visibility = 'vendor'
    and exists (
      select 1
      from public.manager_vendor_records mvr
      where mvr.id = manager_documents.vendor_id
        and mvr.vendor_user_id = auth.uid()
    )
  );
