-- Backfill application.fullLegalName and application.email for records where these
-- fields are missing from the nested application object but exist at the top level.
-- Also propagates the same fix to portal_lease_pipeline_records.

-- Step 1: manager_application_records
-- For every row where row_data->>'name' or row_data->>'email' exists but
-- row_data->'application'->>'fullLegalName' / 'email' is blank, backfill them.

update public.manager_application_records
set row_data = jsonb_set(
    jsonb_set(
      row_data,
      '{application,fullLegalName}',
      to_jsonb(row_data->>'name'),
      true
    ),
    '{application,email}',
    to_jsonb(row_data->>'email'),
    true
  ),
  updated_at = now()
where
  (row_data->>'name') is not null
  and (row_data->>'name') <> ''
  and (
    (row_data->'application'->>'fullLegalName') is null
    or (row_data->'application'->>'fullLegalName') = ''
  );

-- Step 2: portal_lease_pipeline_records
-- Lease rows use 'residentName' / 'residentEmail' at the top level of row_data.

update public.portal_lease_pipeline_records
set row_data = jsonb_set(
    jsonb_set(
      row_data,
      '{application,fullLegalName}',
      to_jsonb(row_data->>'residentName'),
      true
    ),
    '{application,email}',
    to_jsonb(row_data->>'residentEmail'),
    true
  ),
  updated_at = now()
where
  (row_data->>'residentName') is not null
  and (row_data->>'residentName') <> ''
  and (
    (row_data->'application'->>'fullLegalName') is null
    or (row_data->'application'->>'fullLegalName') = ''
  );
