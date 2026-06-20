-- Backfill manager_user_id on lease pipeline records from linked application records.
update public.portal_lease_pipeline_records lease
set manager_user_id = app.manager_user_id,
    updated_at = now()
from public.manager_application_records app
where lease.manager_user_id is null
  and app.manager_user_id is not null
  and (
    (lease.row_data ->> 'axisId' is not null and app.id = lease.row_data ->> 'axisId')
    or (
      lease.resident_email is not null
      and app.resident_email is not null
      and lower(lease.resident_email) = lower(app.resident_email)
      and coalesce(lease.property_id, lease.row_data ->> 'propertyId', '') = coalesce(
        app.property_id,
        app.assigned_property_id,
        app.row_data ->> 'propertyId',
        app.row_data -> 'application' ->> 'propertyId',
        ''
      )
    )
  );

-- Mirror manager_user_id into row_data JSON for client reads that use managerUserId.
update public.portal_lease_pipeline_records
set row_data = jsonb_set(
      coalesce(row_data, '{}'::jsonb),
      '{managerUserId}',
      to_jsonb(manager_user_id::text),
      true
    ),
    updated_at = now()
where manager_user_id is not null
  and (
    row_data is null
    or row_data ->> 'managerUserId' is null
    or row_data ->> 'managerUserId' = ''
  );
