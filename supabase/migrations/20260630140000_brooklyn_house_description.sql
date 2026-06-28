-- Restore Brooklyn Ave manager-only house description (access codes) on the live listing.
update public.manager_property_records
set
  property_data = jsonb_set(
    property_data,
    '{listingSubmission,houseDescription}',
    to_jsonb(
      'House Code is 7500.' || E'\n' ||
      'Front Gate Code is 075.' || E'\n' ||
      'Back Gate Code is 7501.' || E'\n' ||
      'Pantry Code: 9752' || E'\n' ||
      'Back Up House Code: 2572'
    ),
    true
  ),
  updated_at = now()
where id = 'mgr-seed-5259-brooklyn-ave-ne';
