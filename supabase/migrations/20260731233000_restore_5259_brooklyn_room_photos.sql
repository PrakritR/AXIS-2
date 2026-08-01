-- Restore per-room photos for 5259 Brooklyn Ave NE (Ambika Mago).
-- The Jul 30 property restore incorrectly put bedroom shots in housePhotoDataUrls
-- and left every room photoDataUrls empty, so browse/detail fell back to the same
-- house gallery for every room.
update public.manager_property_records
set
  property_data = jsonb_set(
    jsonb_set(
      property_data,
      '{listingSubmission,housePhotoDataUrls}',
      '[
        "https://qahnczmilgptcedaqype.supabase.co/storage/v1/object/public/listing-photos/c49d02b1-7e99-4484-9986-b3b4550c3519/1785196039316-myjnto.jpg",
        "https://qahnczmilgptcedaqype.supabase.co/storage/v1/object/public/listing-photos/c49d02b1-7e99-4484-9986-b3b4550c3519/1785196039318-bey9ho.jpg",
        "https://qahnczmilgptcedaqype.supabase.co/storage/v1/object/public/listing-photos/c49d02b1-7e99-4484-9986-b3b4550c3519/1785196039320-ld2vkl.jpg",
        "https://qahnczmilgptcedaqype.supabase.co/storage/v1/object/public/listing-photos/c49d02b1-7e99-4484-9986-b3b4550c3519/1785196039322-8udwsv.jpg"
      ]'::jsonb,
      true
    ),
    '{listingSubmission,propertyFloorPlanDataUrl}',
    '"https://qahnczmilgptcedaqype.supabase.co/storage/v1/object/public/listing-photos/c49d02b1-7e99-4484-9986-b3b4550c3519/1784676710876-2244c6.jpg"'::jsonb,
    true
  ),
  updated_at = now()
where id = 'mgr-seed-5259-brooklyn-ave-ne';

update public.manager_property_records
set
  property_data = jsonb_set(
    property_data,
    '{listingSubmission,rooms}',
    (
      select jsonb_agg(
        case r->>'id'
          when 'seed-5259-brooklyn-room-1' then jsonb_set(r, '{photoDataUrls}', '["https://qahnczmilgptcedaqype.supabase.co/storage/v1/object/public/listing-photos/c49d02b1-7e99-4484-9986-b3b4550c3519/1785214207134-u7ikfh.jpg"]'::jsonb, true)
          when 'seed-5259-brooklyn-room-2' then jsonb_set(r, '{photoDataUrls}', '["https://qahnczmilgptcedaqype.supabase.co/storage/v1/object/public/listing-photos/c49d02b1-7e99-4484-9986-b3b4550c3519/1785214207149-uf9g8s.jpg"]'::jsonb, true)
          when 'seed-5259-brooklyn-room-3' then jsonb_set(r, '{photoDataUrls}', '["https://qahnczmilgptcedaqype.supabase.co/storage/v1/object/public/listing-photos/c49d02b1-7e99-4484-9986-b3b4550c3519/1785214207140-3xi91o.jpg"]'::jsonb, true)
          when 'seed-5259-brooklyn-room-4' then jsonb_set(r, '{photoDataUrls}', '["https://qahnczmilgptcedaqype.supabase.co/storage/v1/object/public/listing-photos/c49d02b1-7e99-4484-9986-b3b4550c3519/1785214207144-61icqc.jpg"]'::jsonb, true)
          when 'seed-5259-brooklyn-room-5' then jsonb_set(r, '{photoDataUrls}', '["https://qahnczmilgptcedaqype.supabase.co/storage/v1/object/public/listing-photos/c49d02b1-7e99-4484-9986-b3b4550c3519/1785214207147-1cogcd.jpg"]'::jsonb, true)
          else jsonb_set(r, '{photoDataUrls}', '[]'::jsonb, true)
        end
      )
      from jsonb_array_elements(property_data->'listingSubmission'->'rooms') r
    ),
    true
  ),
  updated_at = now()
where id = 'mgr-seed-5259-brooklyn-ave-ne';
