-- Backfill existing pending first-month housing charges so they match the
-- newer lease-start proration logic already used by the app.
--
-- What this fixes:
-- - `first_month_rent` -> `prorated_rent` when leaseStart is not day 1
-- - `utilities`        -> `prorated_utilities` when leaseStart is not day 1
--
-- Scope:
-- - only pending charge rows
-- - only rows linked to an application id
-- - only when the linked application has a valid `application.leaseStart`
--   and that start date is after the 1st of the month
--
-- Idempotent:
-- - rows already stored as `prorated_rent` / `prorated_utilities` are ignored
-- - re-running the migration leaves converted rows unchanged

do $$
declare
  charge_rec        record;
  app_data          jsonb;
  lease_start_raw   text;
  lease_start_date  date;
  day_of_month      int;
  days_in_month     int;
  billable_days     int;
  monthly_amount    numeric;
  prorated_amount   numeric;
  next_kind         text;
  next_title        text;
  next_id           text;
  next_label        text;
  next_due_label    text;
  next_row_data     jsonb;
begin
  for charge_rec in
    select id, row_data, kind, status, manager_user_id, resident_user_id, resident_email, property_id
    from public.portal_household_charge_records
    where status = 'pending'
      and kind in ('first_month_rent', 'utilities')
      and coalesce(row_data->>'applicationId', '') <> ''
  loop
    select row_data
      into app_data
      from public.manager_application_records
     where id = charge_rec.row_data->>'applicationId'
     limit 1;

    if not found or app_data is null then
      continue;
    end if;

    lease_start_raw := app_data->'application'->>'leaseStart';
    if lease_start_raw is null or lease_start_raw !~ '^\d{4}-\d{2}-\d{2}$' then
      continue;
    end if;

    lease_start_date := lease_start_raw::date;
    day_of_month := extract(day from lease_start_date)::int;
    if day_of_month <= 1 then
      continue;
    end if;

    days_in_month := extract(day from (date_trunc('month', lease_start_date) + interval '1 month - 1 day'))::int;
    if days_in_month <= 0 then
      continue;
    end if;

    billable_days := days_in_month - day_of_month + 1;
    if billable_days <= 0 then
      continue;
    end if;

    monthly_amount := nullif(regexp_replace(coalesce(charge_rec.row_data->>'amountLabel', ''), '[^0-9.]', '', 'g'), '')::numeric;
    if monthly_amount is null or monthly_amount <= 0 then
      continue;
    end if;

    prorated_amount := round(monthly_amount * billable_days::numeric / days_in_month::numeric, 2);
    next_label := '$' || to_char(prorated_amount, 'FM999999990.00');
    next_due_label := 'Before ' || trim(to_char(lease_start_date, 'Mon DD, YYYY'));

    if charge_rec.kind = 'first_month_rent' then
      next_kind := 'prorated_rent';
      next_title := 'Prorated first month''s rent';
      next_id := regexp_replace(charge_rec.id, '_first_month_rent$', '_prorated_rent');
    else
      next_kind := 'prorated_utilities';
      next_title := 'Prorated utilities';
      next_id := regexp_replace(charge_rec.id, '_utilities$', '_prorated_utilities');
    end if;

    if next_id = charge_rec.id then
      next_id := charge_rec.id || '_prorated';
    end if;

    next_row_data := charge_rec.row_data
      || jsonb_build_object(
        'id', next_id,
        'kind', next_kind,
        'title', next_title,
        'amountLabel', next_label,
        'balanceLabel', next_label,
        'dueDateLabel', next_due_label
      );

    delete from public.portal_household_charge_records
     where id = charge_rec.id;

    insert into public.portal_household_charge_records (
      id,
      manager_user_id,
      resident_user_id,
      resident_email,
      property_id,
      kind,
      status,
      row_data,
      updated_at
    ) values (
      next_id,
      charge_rec.manager_user_id,
      charge_rec.resident_user_id,
      lower(trim(charge_rec.resident_email)),
      charge_rec.property_id,
      next_kind,
      charge_rec.status,
      next_row_data,
      now()
    )
    on conflict (id) do update set
      manager_user_id = excluded.manager_user_id,
      resident_user_id = excluded.resident_user_id,
      resident_email = excluded.resident_email,
      property_id = excluded.property_id,
      kind = excluded.kind,
      status = excluded.status,
      row_data = excluded.row_data,
      updated_at = excluded.updated_at;
  end loop;
end $$;
