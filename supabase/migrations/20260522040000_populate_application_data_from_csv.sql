-- Populate full application data for the 7 Brooklyn Ave NE residents from the
-- imported spreadsheet. Merges into existing application object so propertyId,
-- room choices, and lease dates already stored are preserved.

-- ─── Arnav Shanbhag (AXIS-APPRECNNELGW) ──────────────────────────────────────
update public.manager_application_records
set
  row_data = jsonb_set(
    row_data,
    '{application}',
    coalesce(row_data->'application', '{}'::jsonb) || jsonb_build_object(
      'fullLegalName',       'Arnav Shanbhag',
      'email',               'arnavjs78@gmail.com',
      'phone',               '(814) 810-7714',
      'dateOfBirth',         '12/28/2005',
      'ssn',                 '356049699',
      'driversLicense',      '900001044321',
      'hasCosigner',         'no',
      'applyingAsGroup',     'no',
      'groupRole',           null,
      'groupSize',           '',
      'groupId',             '',
      'leaseTerm',           '3-Month',
      'leaseStart',          '5/23/2026',
      'leaseEnd',            '8/23/2026',
      'currentStreet',       '519 Onondaga St',
      'currentCity',         'Ann Arbor',
      'currentState',        'MI',
      'currentZip',          '48104',
      'currentLandlordName', 'None',
      'currentLandlordPhone','',
      'currentMoveIn',       '',
      'currentMoveOut',      '',
      'currentReasonLeaving','',
      'notEmployed',         false,
      'employer',            'Pacific Northwest National Laboratory',
      'employerAddress',     '3335 Innovation Dr, Richland, WA 99354',
      'supervisorName',      'Wilson Fearn',
      'supervisorPhone',     '',
      'jobTitle',            'Intern',
      'monthlyIncome',       '$5,000.00',
      'annualIncome',        '$25,000.00',
      'employmentStart',     '5/26/2026',
      'ref1Name',            'Uday Shanbhag',
      'ref1Relationship',    'Father',
      'ref1Phone',           '(217) 840-5126',
      'ref2Name',            'Aparna Joshi',
      'ref2Relationship',    'Mother',
      'ref2Phone',           '(217) 840-7835',
      'occupancyCount',      '1',
      'evictionHistory',     'no',
      'bankruptcyHistory',   'no',
      'criminalHistory',     'no',
      'consentCredit',       true,
      'consentTruth',        true,
      'digitalSignature',    'Arnav Shanbhag',
      'dateSigned',          '4/8/2026'
    )
  ),
  updated_at = now()
where id = 'AXIS-APPRECNNELGW';

-- ─── Connor D Federico Grome (AXIS-APPRECKGD8JW) ─────────────────────────────
update public.manager_application_records
set
  row_data = jsonb_set(
    row_data,
    '{application}',
    coalesce(row_data->'application', '{}'::jsonb) || jsonb_build_object(
      'fullLegalName',       'Connor D Federico Grome',
      'email',               'connorgrome89@gmail.com',
      'phone',               '(774) 270-2926',
      'dateOfBirth',         '5/11/2005',
      'ssn',                 '025-88-7735',
      'driversLicense',      'SA6540073',
      'hasCosigner',         'no',
      'applyingAsGroup',     'no',
      'groupRole',           null,
      'groupSize',           '',
      'groupId',             '',
      'leaseTerm',           '3-Month',
      'leaseStart',          '6/14/2026',
      'leaseEnd',            '9/5/2026',
      'currentStreet',       '22 Walden Drive',
      'currentCity',         'Natick',
      'currentState',        'MA',
      'currentZip',          '01760',
      'currentLandlordName', 'Jon Wangler',
      'currentLandlordPhone','(508) 655-5500',
      'currentMoveIn',       '5/11/2005',
      'currentMoveOut',      '4/15/2026',
      'currentReasonLeaving','Still live there',
      'notEmployed',         false,
      'employer',            'Amazon Web Services',
      'employerAddress',     '2205 7th Ave, Seattle, WA 98121',
      'supervisorName',      'Brett Laffel',
      'supervisorPhone',     '(000) 000-0000',
      'jobTitle',            'General Marketing Specialist Intern',
      'monthlyIncome',       '$6,683.00',
      'annualIncome',        '$0.00',
      'employmentStart',     '6/15/2026',
      'ref1Name',            'Julie Russel',
      'ref1Relationship',    'Friend / Classmate',
      'ref1Phone',           '(225) 773-3212',
      'ref2Name',            'Ahron Springer',
      'ref2Relationship',    'Friend / Classmate',
      'ref2Phone',           '(718) 551-7849',
      'occupancyCount',      '1',
      'evictionHistory',     'no',
      'bankruptcyHistory',   'no',
      'criminalHistory',     'no',
      'consentCredit',       true,
      'consentTruth',        true,
      'digitalSignature',    'Connor D Federico-Grome',
      'dateSigned',          '4/15/2026'
    )
  ),
  updated_at = now()
where id = 'AXIS-APPRECKGD8JW';

-- ─── Kavinu Weerawardhene (AXIS-APPRECAVUA6U) ────────────────────────────────
update public.manager_application_records
set
  row_data = jsonb_set(
    row_data,
    '{application}',
    coalesce(row_data->'application', '{}'::jsonb) || jsonb_build_object(
      'fullLegalName',       'Kavinu Weerawardhene',
      'email',               'kavinuj753@gmail.com',
      'phone',               '(952) 290-3970',
      'dateOfBirth',         '7/15/2005',
      'ssn',                 '475-53-3244',
      'driversLicense',      'M000041700200',
      'hasCosigner',         'yes',
      'applyingAsGroup',     'yes',
      'groupRole',           'first',
      'groupSize',           '5',
      'groupId',             'AXISGRP-P45NRJL764WE',
      'leaseTerm',           '3-Month',
      'leaseStart',          '5/20/2026',
      'leaseEnd',            '8/22/2026',
      'currentStreet',       '101 North Brooks Street',
      'currentCity',         'Madison',
      'currentState',        'WI',
      'currentZip',          '53715',
      'currentLandlordName', 'Rouse Management',
      'currentLandlordPhone','(608) 255-4744',
      'currentMoveIn',       '8/15/2025',
      'currentMoveOut',      '8/15/2026',
      'currentReasonLeaving','New Living Spot for College.',
      'notEmployed',         false,
      'employer',            'Morgridge Institute for Research',
      'employerAddress',     '330 N Orchard St',
      'supervisorName',      'Carlos Frits',
      'supervisorPhone',     '(746) 492-8131',
      'jobTitle',            'Student Lab Assistant',
      'monthlyIncome',       '$900.00',
      'annualIncome',        '$10,800.00',
      'employmentStart',     '1/20/2025',
      'ref1Name',            'Patrick Grunklee',
      'ref1Relationship',    'Colleague',
      'ref1Phone',           '(612) 479-7924',
      'ref2Name',            'Devmini Jayatilaka',
      'ref2Relationship',    'Colleague',
      'ref2Phone',           '(612) 425-8884',
      'occupancyCount',      '1',
      'evictionHistory',     'no',
      'bankruptcyHistory',   'no',
      'criminalHistory',     'no',
      'consentCredit',       true,
      'consentTruth',        true,
      'digitalSignature',    'Kavinu Weerawardhene',
      'dateSigned',          '4/15/2026'
    )
  ),
  updated_at = now()
where id = 'AXIS-APPRECAVUA6U';

-- ─── David Macaraig (AXIS-APPRECLUEW7J) ──────────────────────────────────────
update public.manager_application_records
set
  row_data = jsonb_set(
    row_data,
    '{application}',
    coalesce(row_data->'application', '{}'::jsonb) || jsonb_build_object(
      'fullLegalName',       'David Macaraig',
      'email',               'davidjmacaraig@gmail.com',
      'phone',               '(925) 890-4537',
      'dateOfBirth',         '5/30/2004',
      'ssn',                 '615-45-4844',
      'driversLicense',      'Y7168230',
      'hasCosigner',         'yes',
      'applyingAsGroup',     'yes',
      'groupRole',           'joining',
      'groupSize',           '',
      'groupId',             'AXISGRP-P45NRJL764WE',
      'leaseTerm',           '3-Month',
      'leaseStart',          '5/22/2026',
      'leaseEnd',            '8/21/2026',
      'currentStreet',       '5061 Art Street',
      'currentCity',         'San Diego',
      'currentState',        'CA',
      'currentZip',          '92115',
      'currentLandlordName', '',
      'currentLandlordPhone','',
      'currentMoveIn',       '8/26/2024',
      'currentMoveOut',      '5/13/2026',
      'currentReasonLeaving','Work',
      'notEmployed',         false,
      'employer',            'Pfizer',
      'employerAddress',     '21823 30th Dr SE Bothell WA 98021',
      'supervisorName',      'Bianca Ramdath',
      'supervisorPhone',     '(212) 557-9545',
      'jobTitle',            'CRD/ARD',
      'monthlyIncome',       '$4,640.00',
      'annualIncome',        '$55,680.00',
      'employmentStart',     '5/26/2026',
      'ref1Name',            'Kavinu Weerawardhene',
      'ref1Relationship',    'Colleague',
      'ref1Phone',           '(952) 290-3970',
      'ref2Name',            'Ryan Gribble',
      'ref2Relationship',    'Colleague',
      'ref2Phone',           '(850) 830-8483',
      'occupancyCount',      '1',
      'evictionHistory',     'no',
      'bankruptcyHistory',   'no',
      'criminalHistory',     'no',
      'consentCredit',       true,
      'consentTruth',        true,
      'digitalSignature',    'David Macaraig',
      'dateSigned',          '4/15/2026'
    )
  ),
  updated_at = now()
where id = 'AXIS-APPRECLUEW7J';

-- ─── Tatva Prasad (AXIS-APPRECPLDGTI) ────────────────────────────────────────
update public.manager_application_records
set
  row_data = jsonb_set(
    row_data,
    '{application}',
    coalesce(row_data->'application', '{}'::jsonb) || jsonb_build_object(
      'fullLegalName',       'Tatva Prasad',
      'email',               'tatvapra@usc.edu',
      'phone',               '(510) 399-3322',
      'dateOfBirth',         '7/29/2006',
      'ssn',                 '156-72-1516',
      'driversLicense',      'Y7036608',
      'hasCosigner',         'yes',
      'applyingAsGroup',     'yes',
      'groupRole',           'joining',
      'groupSize',           '',
      'groupId',             'AXISGRP-P45NRJL764WE',
      'leaseTerm',           '3-Month',
      'leaseStart',          '5/22/2026',
      'leaseEnd',            '8/16/2026',
      'currentStreet',       '3131 S Hoover St',
      'currentCity',         'Los Angeles',
      'currentState',        'CA',
      'currentZip',          '90089',
      'currentLandlordName', 'USC',
      'currentLandlordPhone','',
      'currentMoveIn',       '8/18/2025',
      'currentMoveOut',      '5/16/2026',
      'currentReasonLeaving','End of school term',
      'notEmployed',         false,
      'employer',            'Pfizer',
      'employerAddress',     '2500 223rd St SE',
      'supervisorName',      'Noah Theiss',
      'supervisorPhone',     '(425) 527-4000',
      'jobTitle',            'Research and Development',
      'monthlyIncome',       '$4,480.00',
      'annualIncome',        '$53,760.00',
      'employmentStart',     '5/15/2026',
      'ref1Name',            'Vaahin Mehta',
      'ref1Relationship',    'Roommate',
      'ref1Phone',           '(630) 785-0826',
      'ref2Name',            'Nitin Davuluri',
      'ref2Relationship',    'Roommate',
      'ref2Phone',           '(904) 805-2953',
      'occupancyCount',      '1',
      'evictionHistory',     'no',
      'bankruptcyHistory',   'no',
      'criminalHistory',     'no',
      'consentCredit',       true,
      'consentTruth',        true,
      'digitalSignature',    'Tatva Prasad',
      'dateSigned',          '4/15/2026'
    )
  ),
  updated_at = now()
where id = 'AXIS-APPRECPLDGTI';

-- ─── Ryan Gribble (AXIS-APPRECEDEK0E) ────────────────────────────────────────
update public.manager_application_records
set
  row_data = jsonb_set(
    row_data,
    '{application}',
    coalesce(row_data->'application', '{}'::jsonb) || jsonb_build_object(
      'fullLegalName',       'Ryan Gribble',
      'email',               'ryan.d.gribble@gmail.com',
      'phone',               '(850) 830-8483',
      'dateOfBirth',         '2/18/2004',
      'ssn',                 '765-38-5610',
      'driversLicense',      'G614-724-04-058-0',
      'hasCosigner',         'no',
      'applyingAsGroup',     'yes',
      'groupRole',           'joining',
      'groupSize',           '',
      'groupId',             'AXISGRP-P45NRJL764WE',
      'leaseTerm',           '3-Month',
      'leaseStart',          '5/23/2026',
      'leaseEnd',            '8/21/2026',
      'currentStreet',       '4503 Sandhurst Drive',
      'currentCity',         'Orlando',
      'currentState',        'FL',
      'currentZip',          '32817',
      'currentLandlordName', 'Joey Gong',
      'currentLandlordPhone','(407) 409-3429',
      'currentMoveIn',       '7/15/2024',
      'currentMoveOut',      '7/15/2026',
      'currentReasonLeaving','I''m moving for work.',
      'notEmployed',         false,
      'employer',            'Pfizer',
      'employerAddress',     '21823 30th Dr SE Bothell WA 98021',
      'supervisorName',      'Bianca Ramdath',
      'supervisorPhone',     '(212) 557-9545',
      'jobTitle',            'Summer 2026 Pfizer Research and Development Internship',
      'monthlyIncome',       '$4,640.00',
      'annualIncome',        '$55,680.00',
      'employmentStart',     '5/26/2026',
      'ref1Name',            'Anthony Ficaro',
      'ref1Relationship',    'Colleague',
      'ref1Phone',           '(630) 550-9325',
      'ref2Name',            'Sydney Baker',
      'ref2Relationship',    'Colleague',
      'ref2Phone',           '(850) 206-9717',
      'occupancyCount',      '5',
      'evictionHistory',     'no',
      'bankruptcyHistory',   'no',
      'criminalHistory',     'no',
      'consentCredit',       true,
      'consentTruth',        true,
      'digitalSignature',    'Ryan Gribble',
      'dateSigned',          '4/16/2026'
    )
  ),
  updated_at = now()
where id = 'AXIS-APPRECEDEK0E';

-- ─── Wesley Taylor (AXIS-APPRECVRH8CO) ───────────────────────────────────────
update public.manager_application_records
set
  row_data = jsonb_set(
    row_data,
    '{application}',
    coalesce(row_data->'application', '{}'::jsonb) || jsonb_build_object(
      'fullLegalName',       'Wesley Taylor',
      'email',               'wbtaylor002@gmail.com',
      'phone',               '(704) 307-5286',
      'dateOfBirth',         '2/4/2005',
      'ssn',                 '655-20-2401',
      'driversLicense',      '47038418',
      'hasCosigner',         'no',
      'applyingAsGroup',     'yes',
      'groupRole',           'joining',
      'groupSize',           '',
      'groupId',             'AXISGRP-P45NRJL764WE',
      'leaseTerm',           '3-Month',
      'leaseStart',          '5/21/2026',
      'leaseEnd',            '8/15/2026',
      'currentStreet',       '809 East Franklin Street',
      'currentCity',         'Chapel Hill',
      'currentState',        'NC',
      'currentZip',          '27514',
      'currentLandlordName', '',
      'currentLandlordPhone','',
      'currentMoveIn',       '8/17/2025',
      'currentMoveOut',      '5/11/2026',
      'currentReasonLeaving','Internship',
      'prevStreet',          '10345 Kirkmont Drive',
      'prevCity',            'Charlotte',
      'prevState',           'NC',
      'prevZip',             '28269',
      'prevLandlordName',    '',
      'prevLandlordPhone',   '',
      'prevMoveIn',          '4/30/2026',
      'prevMoveOut',         '5/19/2026',
      'prevReasonLeaving',   'School',
      'notEmployed',         false,
      'employer',            'Pfizer',
      'employerAddress',     '21823 30th Dr SE Bothell WA 98021',
      'supervisorName',      '',
      'supervisorPhone',     '',
      'jobTitle',            '',
      'monthlyIncome',       '',
      'annualIncome',        '',
      'employmentStart',     '',
      'ref1Name',            'Mihir Upadhye',
      'ref1Relationship',    'Principal Investigator',
      'ref1Phone',           '(805) 443-1675',
      'ref2Name',            'Steven Mantekas',
      'ref2Relationship',    'High School Boss',
      'ref2Phone',           '(704) 560-5757',
      'occupancyCount',      '1',
      'evictionHistory',     'no',
      'bankruptcyHistory',   'no',
      'criminalHistory',     'no',
      'consentCredit',       true,
      'consentTruth',        true,
      'digitalSignature',    'Wesley Taylor',
      'dateSigned',          '4/15/2026'
    )
  ),
  updated_at = now()
where id = 'AXIS-APPRECVRH8CO';


-- ─── Propagate to portal_lease_pipeline_records ───────────────────────────────
-- Mirror the same application data into lease records matched by resident email.

update public.portal_lease_pipeline_records
set
  row_data = jsonb_set(
    row_data,
    '{application}',
    coalesce(row_data->'application', '{}'::jsonb) || (
      select coalesce(mar.row_data->'application', '{}'::jsonb)
      from public.manager_application_records mar
      where lower(mar.resident_email) = lower(portal_lease_pipeline_records.resident_email)
      limit 1
    )
  ),
  updated_at = now()
where lower(resident_email) in (
  'arnavjs78@gmail.com',
  'connorgrome89@gmail.com',
  'kavinuj753@gmail.com',
  'davidjmacaraig@gmail.com',
  'tatvapra@usc.edu',
  'ryan.d.gribble@gmail.com',
  'wbtaylor002@gmail.com'
);
