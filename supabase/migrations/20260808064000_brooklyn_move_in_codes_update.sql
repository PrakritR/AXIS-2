-- 5259 Brooklyn: correct gate/door codes, drop pantry/backup, add per-room locker combos.
-- Idempotent: safe to re-run.

update public.manager_property_records
set
  property_data = jsonb_set(
    jsonb_set(
      jsonb_set(
        property_data,
        '{listingSubmission,generalHouseInfo}',
        to_jsonb(
          'Front door code: 7500' || E'\n' ||
          'Front gate code: 075' || E'\n' ||
          'Back gate code: 075' || E'\n' ||
          E'\n' ||
          'Wifi Name: Brooklyn House' || E'\n' ||
          'Wifi Password: brooklyn5259' || E'\n' ||
          E'\n' ||
          'Trash Day: Tuesday morning' || E'\n' ||
          'Recycle/Compost Day: Tuesday morning'
        ),
        true
      ),
      '{listingSubmission,houseDescription}',
      to_jsonb(
        'House Code is 7500.' || E'\n' ||
        'Front Gate Code is 075.' || E'\n' ||
        'Back Gate Code is 075.'
      ),
      true
    ),
    '{listingSubmission,rooms}',
    (
      select coalesce(
        jsonb_agg(
          case elem->>'id'
            when 'seed-5259-brooklyn-room-1' then jsonb_set(
              elem,
              '{moveInInstructions}',
              to_jsonb(
                'Assigned to Room 1 (2-person bathroom share with Room 2).' || E'\n\n' ||
                'Access codes:' || E'\n' ||
                'Front door code: 7500' || E'\n' ||
                'Front gate code: 075' || E'\n' ||
                'Back gate code: 075' || E'\n\n' ||
                'Locker box combination: 8916566666' || E'\n\n' ||
                'Use front gate code 075, then front door code 7500. Your bedroom is Room 1.'
              ),
              true
            )
            when 'seed-5259-brooklyn-room-2' then jsonb_set(
              elem,
              '{moveInInstructions}',
              to_jsonb(
                'Assigned to Room 2 (2-person bathroom share with Room 1).' || E'\n\n' ||
                'Access codes:' || E'\n' ||
                'Front door code: 7500' || E'\n' ||
                'Front gate code: 075' || E'\n' ||
                'Back gate code: 075' || E'\n\n' ||
                'Locker box combination: 7820341022' || E'\n\n' ||
                'Use front gate code 075, then front door code 7500. Your bedroom is Room 2.'
              ),
              true
            )
            when 'seed-5259-brooklyn-room-3' then jsonb_set(
              elem,
              '{moveInInstructions}',
              to_jsonb(
                'Assigned to Room 3 (3-person bathroom share with Rooms 4 & 5).' || E'\n\n' ||
                'Access codes:' || E'\n' ||
                'Front door code: 7500' || E'\n' ||
                'Front gate code: 075' || E'\n' ||
                'Back gate code: 075' || E'\n\n' ||
                'Locker box combination: pending — your property manager will send it before move-in.' || E'\n\n' ||
                'Use front gate code 075, then front door code 7500. Your bedroom is Room 3.'
              ),
              true
            )
            when 'seed-5259-brooklyn-room-4' then jsonb_set(
              elem,
              '{moveInInstructions}',
              to_jsonb(
                'Assigned to Room 4 (3-person bathroom share with Rooms 3 & 5).' || E'\n\n' ||
                'Access codes:' || E'\n' ||
                'Front door code: 7500' || E'\n' ||
                'Front gate code: 075' || E'\n' ||
                'Back gate code: 075' || E'\n\n' ||
                'Locker box combination: 9031576091' || E'\n\n' ||
                'Use front gate code 075, then front door code 7500. Your bedroom is Room 4.'
              ),
              true
            )
            when 'seed-5259-brooklyn-room-5' then jsonb_set(
              elem,
              '{moveInInstructions}',
              to_jsonb(
                'Assigned to Room 5 (3-person bathroom share with Rooms 3 & 4).' || E'\n\n' ||
                'Access codes:' || E'\n' ||
                'Front door code: 7500' || E'\n' ||
                'Front gate code: 075' || E'\n' ||
                'Back gate code: 075' || E'\n\n' ||
                'Locker box combination: 2216261232' || E'\n\n' ||
                'Use front gate code 075, then front door code 7500. Your bedroom is Room 5.'
              ),
              true
            )
            when 'seed-5259-brooklyn-room-6' then jsonb_set(
              elem,
              '{moveInInstructions}',
              to_jsonb(
                'Assigned to Room 6 (4-person bathroom share with Rooms 7, 8 & 9).' || E'\n\n' ||
                'Access codes:' || E'\n' ||
                'Front door code: 7500' || E'\n' ||
                'Front gate code: 075' || E'\n' ||
                'Back gate code: 075' || E'\n\n' ||
                'Locker box combination: 9187794484' || E'\n\n' ||
                'Use front gate code 075, then front door code 7500. Your bedroom is Room 6.'
              ),
              true
            )
            when 'seed-5259-brooklyn-room-7' then jsonb_set(
              elem,
              '{moveInInstructions}',
              to_jsonb(
                'Assigned to Room 7 (4-person bathroom share with Rooms 6, 8 & 9).' || E'\n\n' ||
                'Access codes:' || E'\n' ||
                'Front door code: 7500' || E'\n' ||
                'Front gate code: 075' || E'\n' ||
                'Back gate code: 075' || E'\n\n' ||
                'Locker box combination: 8357106792' || E'\n\n' ||
                'Use front gate code 075, then front door code 7500. Your bedroom is Room 7.'
              ),
              true
            )
            when 'seed-5259-brooklyn-room-8' then jsonb_set(
              elem,
              '{moveInInstructions}',
              to_jsonb(
                'Assigned to Room 8 (4-person bathroom share with Rooms 6, 7 & 9).' || E'\n\n' ||
                'Access codes:' || E'\n' ||
                'Front door code: 7500' || E'\n' ||
                'Front gate code: 075' || E'\n' ||
                'Back gate code: 075' || E'\n\n' ||
                'Locker box combination: 3282362130' || E'\n\n' ||
                'Use front gate code 075, then front door code 7500. Your bedroom is Room 8.'
              ),
              true
            )
            when 'seed-5259-brooklyn-room-9' then jsonb_set(
              elem,
              '{moveInInstructions}',
              to_jsonb(
                'Assigned to Room 9 (4-person bathroom share with Rooms 6, 7 & 8).' || E'\n\n' ||
                'Access codes:' || E'\n' ||
                'Front door code: 7500' || E'\n' ||
                'Front gate code: 075' || E'\n' ||
                'Back gate code: 075' || E'\n\n' ||
                'Locker box combination: 0831979973' || E'\n\n' ||
                'Use front gate code 075, then front door code 7500. Your bedroom is Room 9.'
              ),
              true
            )
            else elem
          end
        ),
        '[]'::jsonb
      )
      from jsonb_array_elements(property_data->'listingSubmission'->'rooms') as elem
    ),
    true
  ),
  updated_at = now()
where id = 'mgr-seed-5259-brooklyn-ave-ne';
