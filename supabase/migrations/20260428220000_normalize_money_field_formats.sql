-- Normalise all money field formats in manager_property_records.
-- Strips leading "$" and trailing "/mo" or "/month" from:
--   submission.rooms[*].utilitiesEstimate
--   submission.applicationFee, securityDeposit, moveInFee,
--   parkingMonthly, hoaMonthly, otherMonthlyFees
--   bundles[*].price, bundles[*].strikethrough
-- Safe to run multiple times (idempotent — already-clean values pass through unchanged).

create or replace function _strip_money_format(v text) returns text
  language sql immutable as
$$
  select regexp_replace(
    regexp_replace(trim(v), '^\$', ''),
    '\/mo(nth)?\.?\s*$', '', 'i'
  )
$$;

-- Normalise rooms[*].utilitiesEstimate
update manager_property_records
set row_data = jsonb_set(
  row_data,
  '{submission,rooms}',
  (
    select jsonb_agg(
      case
        when room ? 'utilitiesEstimate'
          then room || jsonb_build_object(
                 'utilitiesEstimate', _strip_money_format(room->>'utilitiesEstimate')
               )
        else room
      end
    )
    from jsonb_array_elements(row_data->'submission'->'rooms') as room
  )
)
where row_data->'submission'->'rooms' is not null
  and jsonb_typeof(row_data->'submission'->'rooms') = 'array';

-- Normalise top-level fee fields on submission
update manager_property_records
set row_data = row_data || jsonb_build_object(
  'submission', row_data->'submission' || jsonb_strip_nulls(jsonb_build_object(
    'applicationFee',   case when row_data->'submission'->>'applicationFee'   is not null then to_jsonb(_strip_money_format(row_data->'submission'->>'applicationFee'))   end,
    'securityDeposit',  case when row_data->'submission'->>'securityDeposit'  is not null then to_jsonb(_strip_money_format(row_data->'submission'->>'securityDeposit'))  end,
    'moveInFee',        case when row_data->'submission'->>'moveInFee'        is not null then to_jsonb(_strip_money_format(row_data->'submission'->>'moveInFee'))        end,
    'parkingMonthly',   case when row_data->'submission'->>'parkingMonthly'   is not null then to_jsonb(_strip_money_format(row_data->'submission'->>'parkingMonthly'))   end,
    'hoaMonthly',       case when row_data->'submission'->>'hoaMonthly'       is not null then to_jsonb(_strip_money_format(row_data->'submission'->>'hoaMonthly'))       end,
    'otherMonthlyFees', case when row_data->'submission'->>'otherMonthlyFees' is not null then to_jsonb(_strip_money_format(row_data->'submission'->>'otherMonthlyFees')) end
  ))
)
where row_data->'submission' is not null
  and jsonb_typeof(row_data->'submission') = 'object';

-- Normalise bundles[*].price and bundles[*].strikethrough
update manager_property_records
set row_data = jsonb_set(
  row_data,
  '{submission,bundles}',
  (
    select jsonb_agg(
      bundle
      || case when bundle ? 'price'         then jsonb_build_object('price',         _strip_money_format(bundle->>'price'))         else '{}'::jsonb end
      || case when bundle ? 'strikethrough' then jsonb_build_object('strikethrough', _strip_money_format(bundle->>'strikethrough')) else '{}'::jsonb end
    )
    from jsonb_array_elements(row_data->'submission'->'bundles') as bundle
  )
)
where row_data->'submission'->'bundles' is not null
  and jsonb_typeof(row_data->'submission'->'bundles') = 'array';

drop function _strip_money_format(text);
