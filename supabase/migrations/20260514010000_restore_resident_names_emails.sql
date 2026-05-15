-- Restore name/email data for the 10 APPREC-prefixed resident records that
-- were created from the original seed applicants but lost their personal info.
-- Also removes the 19 blank MORT/MOW placeholder records that have no data.

with manager as (
  select id
  from public.profiles
  where lower(email) in ('prakritramachandran@gmail.com', 'prakritramachandran@gmai.com')
  order by created_at desc
  limit 1
)

-- Restore Arnav Shanbhag (AXIS-NNELGWQH → AXIS-APPRECNNELGW)
update public.manager_application_records
set
  resident_email = 'arnavjs78@gmail.com',
  row_data = row_data || jsonb_build_object(
    'name',  'Arnav Shanbhag',
    'email', 'arnavjs78@gmail.com',
    'detail', 'Imported from spreadsheet - signed 4/8/2026'
  ),
  updated_at = now()
where id = 'AXIS-APPRECNNELGW';

-- Restore Kavinu Weerawardhene (AXIS-AVUA6UPM → AXIS-APPRECAVUA6U)
update public.manager_application_records
set
  resident_email = 'kavinuj753@gmail.com',
  row_data = row_data || jsonb_build_object(
    'name',  'Kavinu Weerawardhene',
    'email', 'kavinuj753@gmail.com',
    'detail', 'Imported from spreadsheet - signed 4/15/2026'
  ),
  updated_at = now()
where id = 'AXIS-APPRECAVUA6U';

-- Restore Ryan Gribble (AXIS-EDEK0E02 → AXIS-APPRECEDEK0E)
update public.manager_application_records
set
  resident_email = 'ryan.d.gribble@gmail.com',
  row_data = row_data || jsonb_build_object(
    'name',  'Ryan Gribble',
    'email', 'ryan.d.gribble@gmail.com',
    'detail', 'Imported from spreadsheet - signed 4/16/2026'
  ),
  updated_at = now()
where id = 'AXIS-APPRECEDEK0E';

-- Restore David Hyungchan Yoo (AXIS-DAVIDYOO → AXIS-APPRECDAVIDY)
update public.manager_application_records
set
  resident_email = 'davidhyoo1@gmail.com',
  row_data = row_data || jsonb_build_object(
    'name',  'David Hyungchan Yoo',
    'email', 'davidhyoo1@gmail.com',
    'detail', 'Imported from PDF - Brooklyn application signed 3/30/2026'
  ),
  updated_at = now()
where id = 'AXIS-APPRECDAVIDY';

-- Restore David Macaraig (AXIS-LUEW7J5G → AXIS-APPRECLUEW7J)
update public.manager_application_records
set
  resident_email = 'davidjmacaraig@gmail.com',
  row_data = row_data || jsonb_build_object(
    'name',  'David Macaraig',
    'email', 'davidjmacaraig@gmail.com',
    'detail', 'Imported from spreadsheet - signed 4/15/2026'
  ),
  updated_at = now()
where id = 'AXIS-APPRECLUEW7J';

-- Restore Tatva Prasad (AXIS-PLDGTIPM → AXIS-APPRECPLDGTI)
update public.manager_application_records
set
  resident_email = 'tatvapra@usc.edu',
  row_data = row_data || jsonb_build_object(
    'name',  'Tatva Prasad',
    'email', 'tatvapra@usc.edu',
    'detail', 'Imported from spreadsheet - signed 4/15/2026'
  ),
  updated_at = now()
where id = 'AXIS-APPRECPLDGTI';

-- Restore Jewook Park (AXIS-JEWOOKPA → AXIS-APPRECJEWOOK)
update public.manager_application_records
set
  resident_email = 'jewook.parkder@gmail.com',
  row_data = row_data || jsonb_build_object(
    'name',  'Jewook Park',
    'email', 'jewook.parkder@gmail.com',
    'detail', 'Imported from PDF - Brooklyn application signed 3/30/2026'
  ),
  updated_at = now()
where id = 'AXIS-APPRECJEWOOK';

-- Restore Wesley Taylor (AXIS-VRH8COLT → AXIS-APPRECVRH8CO)
update public.manager_application_records
set
  resident_email = 'wbtaylor002@gmail.com',
  row_data = row_data || jsonb_build_object(
    'name',  'Wesley Taylor',
    'email', 'wbtaylor002@gmail.com',
    'detail', 'Imported from spreadsheet - signed 4/15/2026'
  ),
  updated_at = now()
where id = 'AXIS-APPRECVRH8CO';

-- Restore Connor D Federico Grome (AXIS-KGD8JWSJ → AXIS-APPRECKGD8JW)
update public.manager_application_records
set
  resident_email = 'connorgrome89@gmail.com',
  row_data = row_data || jsonb_build_object(
    'name',  'Connor D Federico Grome',
    'email', 'connorgrome89@gmail.com',
    'detail', 'Imported from spreadsheet - signed 4/15/2026'
  ),
  updated_at = now()
where id = 'AXIS-APPRECKGD8JW';

-- Restore record AXIS-5AF8409C (Fathima Shaikh based on room/date context)
update public.manager_application_records
set
  resident_email = 'fathimashaikh318@gmail.com',
  row_data = row_data || jsonb_build_object(
    'name',  'Fathima Shaikh',
    'email', 'fathimashaikh318@gmail.com',
    'detail', 'Imported from spreadsheet - signed 4/9/2026'
  ),
  updated_at = now()
where id = 'AXIS-5AF8409C';

-- Delete the 19 blank placeholder records (MORT/MOW prefix, no name or email).
-- These were manually added without any resident information and have no data to restore.
delete from public.manager_application_records
where id in (
  'AXIS-MORTFUU9',
  'AXIS-MORTHM63',
  'AXIS-MORTLGHJ',
  'AXIS-MORTOMWW',
  'AXIS-MORT8Z6A',
  'AXIS-MORT7L8Z',
  'AXIS-MORT5FWB',
  'AXIS-MOW32Z14',
  'AXIS-MOW30RKX',
  'AXIS-MORTVM8L',
  'AXIS-MOW31FX1',
  'AXIS-MOW323EI',
  'AXIS-MOW33MCU',
  'AXIS-MOW344O7',
  'AXIS-MORTE321',
  'AXIS-MOW301CY',
  'AXIS-MORTRNOI',
  'AXIS-MOW2ZD1D',
  'AXIS-MORTT6N0'
);
