-- Resident-facing move-in instructions for 5259 Brooklyn Ave NE (all 9 rooms).
-- House access codes recovered from 20260630140000_brooklyn_house_description.sql.
-- Idempotent: safe to re-run.

update public.manager_property_records
set
  property_data = jsonb_set(
    jsonb_set(
      property_data,
      '{listingSubmission,generalHouseInfo}',
      to_jsonb(
        'Access codes for 5259 Brooklyn Ave NE:' || E'\n' ||
        'House code: 7500' || E'\n' ||
        'Front gate: 075' || E'\n' ||
        'Back gate: 7501' || E'\n' ||
        'Pantry: 9752' || E'\n' ||
        'Backup house code: 2572'
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
                'House code: 7500' || E'\n' ||
                'Front gate: 075' || E'\n' ||
                'Back gate: 7501' || E'\n' ||
                'Pantry: 9752' || E'\n' ||
                'Backup house code: 2572' || E'\n\n' ||
                'Use front gate code 075, then house code 7500 at the front door. Your bedroom is Room 1.'
              ),
              true
            )
            when 'seed-5259-brooklyn-room-2' then jsonb_set(
              elem,
              '{moveInInstructions}',
              to_jsonb(
                'Assigned to Room 2 (2-person bathroom share with Room 1).' || E'\n\n' ||
                'Access codes:' || E'\n' ||
                'House code: 7500' || E'\n' ||
                'Front gate: 075' || E'\n' ||
                'Back gate: 7501' || E'\n' ||
                'Pantry: 9752' || E'\n' ||
                'Backup house code: 2572' || E'\n\n' ||
                'Use front gate code 075, then house code 7500 at the front door. Your bedroom is Room 2.'
              ),
              true
            )
            when 'seed-5259-brooklyn-room-3' then jsonb_set(
              elem,
              '{moveInInstructions}',
              to_jsonb(
                'Assigned to Room 3 (3-person bathroom share with Rooms 4 & 5).' || E'\n\n' ||
                'Access codes:' || E'\n' ||
                'House code: 7500' || E'\n' ||
                'Front gate: 075' || E'\n' ||
                'Back gate: 7501' || E'\n' ||
                'Pantry: 9752' || E'\n' ||
                'Backup house code: 2572' || E'\n\n' ||
                'Use front gate code 075, then house code 7500 at the front door. Your bedroom is Room 3.'
              ),
              true
            )
            when 'seed-5259-brooklyn-room-4' then jsonb_set(
              elem,
              '{moveInInstructions}',
              to_jsonb(
                'Assigned to Room 4 (3-person bathroom share with Rooms 3 & 5).' || E'\n\n' ||
                'Access codes:' || E'\n' ||
                'House code: 7500' || E'\n' ||
                'Front gate: 075' || E'\n' ||
                'Back gate: 7501' || E'\n' ||
                'Pantry: 9752' || E'\n' ||
                'Backup house code: 2572' || E'\n\n' ||
                'Use front gate code 075, then house code 7500 at the front door. Your bedroom is Room 4.'
              ),
              true
            )
            when 'seed-5259-brooklyn-room-5' then jsonb_set(
              elem,
              '{moveInInstructions}',
              to_jsonb(
                'Assigned to Room 5 (3-person bathroom share with Rooms 3 & 4).' || E'\n\n' ||
                'Access codes:' || E'\n' ||
                'House code: 7500' || E'\n' ||
                'Front gate: 075' || E'\n' ||
                'Back gate: 7501' || E'\n' ||
                'Pantry: 9752' || E'\n' ||
                'Backup house code: 2572' || E'\n\n' ||
                'Use front gate code 075, then house code 7500 at the front door. Your bedroom is Room 5.'
              ),
              true
            )
            when 'seed-5259-brooklyn-room-6' then jsonb_set(
              elem,
              '{moveInInstructions}',
              to_jsonb(
                'Assigned to Room 6 (4-person bathroom share with Rooms 7, 8 & 9).' || E'\n\n' ||
                'Access codes:' || E'\n' ||
                'House code: 7500' || E'\n' ||
                'Front gate: 075' || E'\n' ||
                'Back gate: 7501' || E'\n' ||
                'Pantry: 9752' || E'\n' ||
                'Backup house code: 2572' || E'\n\n' ||
                'Use front gate code 075, then house code 7500 at the front door. Your bedroom is Room 6.'
              ),
              true
            )
            when 'seed-5259-brooklyn-room-7' then jsonb_set(
              elem,
              '{moveInInstructions}',
              to_jsonb(
                'Assigned to Room 7 (4-person bathroom share with Rooms 6, 8 & 9).' || E'\n\n' ||
                'Access codes:' || E'\n' ||
                'House code: 7500' || E'\n' ||
                'Front gate: 075' || E'\n' ||
                'Back gate: 7501' || E'\n' ||
                'Pantry: 9752' || E'\n' ||
                'Backup house code: 2572' || E'\n\n' ||
                'Use front gate code 075, then house code 7500 at the front door. Your bedroom is Room 7.'
              ),
              true
            )
            when 'seed-5259-brooklyn-room-8' then jsonb_set(
              elem,
              '{moveInInstructions}',
              to_jsonb(
                'Assigned to Room 8 (4-person bathroom share with Rooms 6, 7 & 9).' || E'\n\n' ||
                'Access codes:' || E'\n' ||
                'House code: 7500' || E'\n' ||
                'Front gate: 075' || E'\n' ||
                'Back gate: 7501' || E'\n' ||
                'Pantry: 9752' || E'\n' ||
                'Backup house code: 2572' || E'\n\n' ||
                'Use front gate code 075, then house code 7500 at the front door. Your bedroom is Room 8.'
              ),
              true
            )
            when 'seed-5259-brooklyn-room-9' then jsonb_set(
              elem,
              '{moveInInstructions}',
              to_jsonb(
                'Assigned to Room 9 (4-person bathroom share with Rooms 6, 7 & 8).' || E'\n\n' ||
                'Access codes:' || E'\n' ||
                'House code: 7500' || E'\n' ||
                'Front gate: 075' || E'\n' ||
                'Back gate: 7501' || E'\n' ||
                'Pantry: 9752' || E'\n' ||
                'Backup house code: 2572' || E'\n\n' ||
                'Use front gate code 075, then house code 7500 at the front door. Your bedroom is Room 9.'
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
