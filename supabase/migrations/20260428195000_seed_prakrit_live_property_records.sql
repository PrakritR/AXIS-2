-- Backfill Prakrit's existing live houses into the persistent property table.
-- This makes the houses visible from incognito/public pages without localStorage seeds.

with manager as (
  select id
  from public.profiles
  where lower(email) in ('prakritramachandran@gmail.com', 'prakritramachandran@gmai.com')
  order by created_at desc
  limit 1
),
seed(id, property_data) as (
  values
    (
      'mgr-seed-4709a-8th-ave-ne',
      $json$
      {
        "id": "mgr-seed-4709a-8th-ave-ne",
        "title": "4709A 8th Ave NE - 10 rooms",
        "tagline": "Furnished shared housing near UW with floor and full-house options.",
        "address": "4709A 8th Ave NE, Seattle, WA",
        "zip": "98105",
        "neighborhood": "University District",
        "beds": 10,
        "baths": 3.5,
        "rentLabel": "$750-$875 / mo",
        "available": "Aug 2026 - Jan 2027",
        "petFriendly": false,
        "buildingId": "mgr-bld-4709a-8th-ave-ne",
        "buildingName": "4709A 8th Ave NE",
        "unitLabel": "10 rooms",
        "mapLat": 47.66348,
        "mapLng": -122.31962,
        "adminPublishLive": true,
        "listingSubmission": {
          "v": 1,
          "buildingName": "4709A 8th Ave NE",
          "address": "4709A 8th Ave NE, Seattle, WA",
          "zip": "98105",
          "neighborhood": "University District",
          "tagline": "Furnished shared housing near UW with floor and full-house options.",
          "petFriendly": false,
          "houseOverview": "Shared housing across 3 floors with 10 bedrooms and 3.5 bathrooms. Rooms are furnished and the home includes in-unit laundry, shared kitchen and living areas, bi-monthly cleaning, and street parking.",
          "houseRulesText": "Shared housing. Keep common areas clean, respect quiet hours, and coordinate guests with housemates.",
          "housePhotoDataUrls": [],
          "leaseTermsBody": "Four lease options available: 3-month, 9-month, and 12-month, plus month-to-month with an extra $25/month charge.",
          "applicationFee": "$50",
          "securityDeposit": "$500",
          "moveInFee": "First month rent + $500 deposit",
          "paymentAtSigningIncludes": ["security_deposit", "first_month_rent"],
          "houseCostsDetail": "Flat fee: $175/month - includes cleaning (bi-monthly), WiFi, water & trash.",
          "parkingMonthly": "Street parking",
          "hoaMonthly": "",
          "otherMonthlyFees": "$25/month for month-to-month leases.",
          "sharedSpaces": [],
          "amenitiesText": "Walkable neighborhood\nIn-unit laundry\nPeriodic cleaning included\nWiFi\nAir conditioning\nNear public transit\nParking available",
          "zellePaymentsEnabled": false,
          "zelleContact": "",
          "applicationFeeStripeEnabled": true,
          "applicationFeeZelleEnabled": false,
          "bathrooms": [],
          "bundles": [],
          "quickFacts": [
            { "id": "seed-4709a-qf-beds", "label": "Bedrooms", "value": "10" },
            { "id": "seed-4709a-qf-baths", "label": "Bathrooms", "value": "3.5" },
            { "id": "seed-4709a-qf-type", "label": "Type", "value": "Shared housing" }
          ],
          "rooms": [
            { "id": "seed-4709a-room-1", "name": "Room 1", "floor": "Second Floor", "monthlyRent": 800, "availability": "Available after January 1, 2027", "detail": "Second Floor", "furnishing": "Bed, desk, and chair", "roomAmenitiesText": "Desk\nBed\nKeypad lock\nHardwood floors\nHeating\nAC", "photoDataUrls": [], "videoDataUrl": null, "utilitiesEstimate": "$175/month" },
            { "id": "seed-4709a-room-2", "name": "Room 2", "floor": "Second Floor", "monthlyRent": 775, "availability": "Available after September 5, 2026", "detail": "Second Floor", "furnishing": "Bed, desk, and chair", "roomAmenitiesText": "Desk\nBed\nKeypad lock\nHardwood floors\nHeating\nAC", "photoDataUrls": [], "videoDataUrl": null, "utilitiesEstimate": "$175/month" },
            { "id": "seed-4709a-room-3", "name": "Room 3", "floor": "Second Floor", "monthlyRent": 775, "availability": "Unavailable", "detail": "Second Floor", "furnishing": "Bed, desk, and chair", "roomAmenitiesText": "Desk\nBed\nKeypad lock\nHardwood floors\nHeating\nAC", "photoDataUrls": [], "videoDataUrl": null, "utilitiesEstimate": "$175/month" },
            { "id": "seed-4709a-room-4", "name": "Room 4", "floor": "Second Floor", "monthlyRent": 775, "availability": "Unavailable", "detail": "Second Floor", "furnishing": "Bed, desk, and chair", "roomAmenitiesText": "Desk\nBed\nKeypad lock\nHardwood floors\nHeating\nAC", "photoDataUrls": [], "videoDataUrl": null, "utilitiesEstimate": "$175/month" },
            { "id": "seed-4709a-room-5", "name": "Room 5", "floor": "Third Floor", "monthlyRent": 775, "availability": "Unavailable", "detail": "Third Floor", "furnishing": "Bed, desk, and chair", "roomAmenitiesText": "Desk\nBed\nKeypad lock\nHardwood floors\nHeating\nAC", "photoDataUrls": [], "videoDataUrl": null, "utilitiesEstimate": "$175/month" },
            { "id": "seed-4709a-room-6", "name": "Room 6", "floor": "Third Floor", "monthlyRent": 775, "availability": "Unavailable", "detail": "Third Floor", "furnishing": "Bed, desk, and chair", "roomAmenitiesText": "Desk\nBed\nKeypad lock\nHardwood floors\nHeating\nAC", "photoDataUrls": [], "videoDataUrl": null, "utilitiesEstimate": "$175/month" },
            { "id": "seed-4709a-room-7", "name": "Room 7", "floor": "Third Floor", "monthlyRent": 775, "availability": "Unavailable", "detail": "Third Floor", "furnishing": "Bed, desk, and chair", "roomAmenitiesText": "Desk\nBed\nKeypad lock\nHardwood floors\nHeating\nAC", "photoDataUrls": [], "videoDataUrl": null, "utilitiesEstimate": "$175/month" },
            { "id": "seed-4709a-room-8", "name": "Room 8", "floor": "Third Floor", "monthlyRent": 775, "availability": "Available now", "detail": "Third Floor", "furnishing": "Bed, desk, and chair", "roomAmenitiesText": "Desk\nBed\nKeypad lock\nHardwood floors\nHeating\nAC", "photoDataUrls": [], "videoDataUrl": null, "utilitiesEstimate": "$175/month" },
            { "id": "seed-4709a-room-9", "name": "Room 9", "floor": "First Floor - Room 9", "monthlyRent": 750, "availability": "Available after September 1, 2026", "detail": "First Floor - Room 9", "furnishing": "Bed, desk, and chair", "roomAmenitiesText": "Desk\nBed\nKeypad lock\nHardwood floors\nHeating\nAC", "photoDataUrls": [], "videoDataUrl": null, "utilitiesEstimate": "$175/month" },
            { "id": "seed-4709a-room-10", "name": "Room 10", "floor": "First Floor - Room 10", "monthlyRent": 875, "availability": "Available after August 10, 2026", "detail": "First Floor - Room 10 - Private bathroom", "furnishing": "Bed, desk, and chair", "roomAmenitiesText": "Desk\nBed\nKeypad lock\nHardwood floors\nHeating\nAC\nPrivate bathroom", "photoDataUrls": [], "videoDataUrl": null, "utilitiesEstimate": "$175/month" }
          ]
        }
      }
      $json$::jsonb
    ),
    (
      'mgr-seed-4709b-8th-ave-ne',
      $json$
      {
        "id": "mgr-seed-4709b-8th-ave-ne",
        "title": "4709B 8th Ave NE - 9 rooms",
        "tagline": "Immediate shared-housing inventory in a walkable Seattle location.",
        "address": "4709B 8th Ave NE, Seattle, WA",
        "zip": "98105",
        "neighborhood": "University District",
        "beds": 9,
        "baths": 2.5,
        "rentLabel": "$775-$800 / mo",
        "available": "Now",
        "petFriendly": false,
        "buildingId": "mgr-bld-4709b-8th-ave-ne",
        "buildingName": "4709B 8th Ave NE",
        "unitLabel": "9 rooms",
        "mapLat": 47.66348,
        "mapLng": -122.31962,
        "adminPublishLive": true,
        "listingSubmission": {
          "v": 1,
          "buildingName": "4709B 8th Ave NE",
          "address": "4709B 8th Ave NE, Seattle, WA",
          "zip": "98105",
          "neighborhood": "University District",
          "tagline": "Immediate shared-housing inventory in a walkable Seattle location.",
          "petFriendly": false,
          "houseOverview": "Shared housing in a multi-floor home with 9 bedrooms and 2.5 bathrooms. Furnished rooms, shared bathrooms across floors, in-unit laundry, kitchen, and lounge.",
          "houseRulesText": "Shared housing. Keep common areas clean, respect quiet hours, and coordinate guests with housemates.",
          "housePhotoDataUrls": [],
          "leaseTermsBody": "Four lease options available: 3-month, 9-month, and 12-month, plus month-to-month with an extra $25/month charge.",
          "applicationFee": "$50",
          "securityDeposit": "$500",
          "moveInFee": "First month rent + $500 deposit",
          "paymentAtSigningIncludes": ["security_deposit", "first_month_rent"],
          "houseCostsDetail": "Flat fee: $175/month - includes cleaning (bi-monthly), WiFi, water & trash.",
          "parkingMonthly": "Street parking",
          "hoaMonthly": "",
          "otherMonthlyFees": "$25/month for month-to-month leases.",
          "sharedSpaces": [],
          "amenitiesText": "Walkable neighborhood\nIn-unit laundry\nPeriodic cleaning included\nWiFi\nAir conditioning\nNear public transit\nParking available",
          "zellePaymentsEnabled": false,
          "zelleContact": "",
          "applicationFeeStripeEnabled": true,
          "applicationFeeZelleEnabled": false,
          "bathrooms": [],
          "bundles": [],
          "quickFacts": [
            { "id": "seed-4709b-qf-beds", "label": "Bedrooms", "value": "9" },
            { "id": "seed-4709b-qf-baths", "label": "Bathrooms", "value": "2.5" },
            { "id": "seed-4709b-qf-type", "label": "Type", "value": "Shared housing" }
          ],
          "rooms": [
            { "id": "seed-4709b-room-1", "name": "Room 1", "floor": "First Floor", "monthlyRent": 775, "availability": "Available now", "detail": "First Floor - Shares bathroom with the second floor as well", "furnishing": "Bed, desk, heating and AC.", "roomAmenitiesText": "Desk\nBed\nHeating\nAC", "photoDataUrls": [], "videoDataUrl": null, "utilitiesEstimate": "$175/month" },
            { "id": "seed-4709b-room-2", "name": "Room 2", "floor": "Second Floor", "monthlyRent": 800, "availability": "Available now", "detail": "Second Floor", "furnishing": "Bed, desk, heating and AC.", "roomAmenitiesText": "Desk\nBed\nHeating\nAC", "photoDataUrls": [], "videoDataUrl": null, "utilitiesEstimate": "$175/month" },
            { "id": "seed-4709b-room-3", "name": "Room 3", "floor": "Second Floor", "monthlyRent": 800, "availability": "Available now", "detail": "Second Floor", "furnishing": "Bed, desk, heating and AC.", "roomAmenitiesText": "Desk\nBed\nHeating\nAC", "photoDataUrls": [], "videoDataUrl": null, "utilitiesEstimate": "$175/month" },
            { "id": "seed-4709b-room-4", "name": "Room 4", "floor": "Second Floor", "monthlyRent": 800, "availability": "Available now", "detail": "Second Floor", "furnishing": "Bed, desk, heating and AC.", "roomAmenitiesText": "Desk\nBed\nHeating\nAC", "photoDataUrls": [], "videoDataUrl": null, "utilitiesEstimate": "$175/month" },
            { "id": "seed-4709b-room-5", "name": "Room 5", "floor": "Second Floor", "monthlyRent": 800, "availability": "Available now", "detail": "Second Floor", "furnishing": "Bed, desk, heating and AC.", "roomAmenitiesText": "Desk\nBed\nHeating\nAC", "photoDataUrls": [], "videoDataUrl": null, "utilitiesEstimate": "$175/month" },
            { "id": "seed-4709b-room-6", "name": "Room 6", "floor": "Third Floor", "monthlyRent": 800, "availability": "Available now", "detail": "Third Floor", "furnishing": "Bed, desk, heating and AC.", "roomAmenitiesText": "Desk\nBed\nHeating\nAC", "photoDataUrls": [], "videoDataUrl": null, "utilitiesEstimate": "$175/month" },
            { "id": "seed-4709b-room-7", "name": "Room 7", "floor": "Third Floor", "monthlyRent": 800, "availability": "Available now", "detail": "Third Floor", "furnishing": "Bed, desk, heating and AC.", "roomAmenitiesText": "Desk\nBed\nHeating\nAC", "photoDataUrls": [], "videoDataUrl": null, "utilitiesEstimate": "$175/month" },
            { "id": "seed-4709b-room-8", "name": "Room 8", "floor": "Third Floor", "monthlyRent": 800, "availability": "Available now", "detail": "Third Floor", "furnishing": "Bed, desk, heating and AC.", "roomAmenitiesText": "Desk\nBed\nHeating\nAC", "photoDataUrls": [], "videoDataUrl": null, "utilitiesEstimate": "$175/month" },
            { "id": "seed-4709b-room-9", "name": "Room 9", "floor": "Third Floor", "monthlyRent": 800, "availability": "Available now", "detail": "Third Floor", "furnishing": "Bed, desk, heating and AC.", "roomAmenitiesText": "Desk\nBed\nHeating\nAC", "photoDataUrls": [], "videoDataUrl": null, "utilitiesEstimate": "$175/month" }
          ]
        }
      }
      $json$::jsonb
    ),
    (
      'mgr-seed-5259-brooklyn-ave-ne',
      $json$
      {
        "id": "mgr-seed-5259-brooklyn-ave-ne",
        "title": "5259 Brooklyn Ave NE - 9 rooms",
        "tagline": "University District shared housing near UW, transit, and food.",
        "address": "5259 Brooklyn Ave NE, Seattle, WA",
        "zip": "98105",
        "neighborhood": "University District",
        "beds": 9,
        "baths": 3,
        "rentLabel": "$800-$865 / mo",
        "available": "April 2026",
        "petFriendly": false,
        "buildingId": "mgr-bld-5259-brooklyn-ave-ne",
        "buildingName": "5259 Brooklyn Ave NE",
        "unitLabel": "9 rooms",
        "mapLat": 47.66735,
        "mapLng": -122.31461,
        "adminPublishLive": true,
        "listingSubmission": {
          "v": 1,
          "buildingName": "5259 Brooklyn Ave NE",
          "address": "5259 Brooklyn Ave NE, Seattle, WA",
          "zip": "98105",
          "neighborhood": "University District",
          "tagline": "University District shared housing near UW, transit, and food.",
          "petFriendly": false,
          "houseOverview": "Shared housing near UW with 9 bedrooms and 3 bathrooms. Furnished rooms, grouped shared bathrooms, in-unit laundry, package storage, and walkable access to transit and food.",
          "houseRulesText": "Shared housing. Keep common areas clean, respect quiet hours, and coordinate guests with housemates.",
          "housePhotoDataUrls": [],
          "leaseTermsBody": "Four lease options available: 3-month, 9-month, and 12-month, plus month-to-month with an extra $25/month charge.",
          "applicationFee": "$50",
          "securityDeposit": "$600",
          "moveInFee": "First month rent + $600 deposit",
          "paymentAtSigningIncludes": ["security_deposit", "first_month_rent"],
          "houseCostsDetail": "Flat fee: $175/month - includes cleaning (bi-monthly), WiFi, water & trash.",
          "parkingMonthly": "Street parking",
          "hoaMonthly": "",
          "otherMonthlyFees": "$25/month for month-to-month leases.",
          "sharedSpaces": [],
          "amenitiesText": "Walkable neighborhood\nIn-unit laundry\nPeriodic cleaning included\nWiFi\nAir conditioning\nNear public transit\nParking available\nPackage Storage",
          "zellePaymentsEnabled": false,
          "zelleContact": "",
          "applicationFeeStripeEnabled": true,
          "applicationFeeZelleEnabled": false,
          "bathrooms": [],
          "bundles": [],
          "quickFacts": [
            { "id": "seed-5259-brooklyn-qf-beds", "label": "Bedrooms", "value": "9" },
            { "id": "seed-5259-brooklyn-qf-baths", "label": "Bathrooms", "value": "3" },
            { "id": "seed-5259-brooklyn-qf-type", "label": "Type", "value": "Shared housing" }
          ],
          "rooms": [
            { "id": "seed-5259-brooklyn-room-1", "name": "Room 1", "floor": "2-Person Bathroom Share", "monthlyRent": 865, "availability": "Available after April 10, 2026", "detail": "2-Bedroom Share (Rooms 1 & 2) - Shares bathroom with Room 2", "furnishing": "Bed, desk, and heating.", "roomAmenitiesText": "Desk\nBed\nHeating", "photoDataUrls": [], "videoDataUrl": null, "utilitiesEstimate": "$175/month" },
            { "id": "seed-5259-brooklyn-room-2", "name": "Room 2", "floor": "2-Person Bathroom Share", "monthlyRent": 865, "availability": "Available after April 10, 2026", "detail": "2-Bedroom Share (Rooms 1 & 2) - Shares bathroom with Room 1", "furnishing": "Bed, desk, and heating.", "roomAmenitiesText": "Desk\nBed\nHeating", "photoDataUrls": [], "videoDataUrl": null, "utilitiesEstimate": "$175/month" },
            { "id": "seed-5259-brooklyn-room-3", "name": "Room 3", "floor": "3-Person Bathroom Share", "monthlyRent": 825, "availability": "Available April 10, 2026-May 15, 2026 and after August 14, 2026", "detail": "3-Bedroom Share (Rooms 3, 4 & 5) - Shares bathroom with Rooms 4 and 5", "furnishing": "Bed, desk, and heating.", "roomAmenitiesText": "Desk\nBed\nHeating", "photoDataUrls": [], "videoDataUrl": null, "utilitiesEstimate": "$175/month" },
            { "id": "seed-5259-brooklyn-room-4", "name": "Room 4", "floor": "3-Person Bathroom Share", "monthlyRent": 825, "availability": "Available April 10, 2026-May 15, 2026 and after August 14, 2026", "detail": "3-Bedroom Share (Rooms 3, 4 & 5) - Shares bathroom with Rooms 3 and 5", "furnishing": "Bed, desk, and heating.", "roomAmenitiesText": "Desk\nBed\nHeating", "photoDataUrls": [], "videoDataUrl": null, "utilitiesEstimate": "$175/month" },
            { "id": "seed-5259-brooklyn-room-5", "name": "Room 5", "floor": "3-Person Bathroom Share", "monthlyRent": 825, "availability": "Available after April 10, 2026", "detail": "3-Bedroom Share (Rooms 3, 4 & 5) - Shares bathroom with Rooms 3 and 4", "furnishing": "Bed, desk, and heating.", "roomAmenitiesText": "Desk\nBed\nHeating", "photoDataUrls": [], "videoDataUrl": null, "utilitiesEstimate": "$175/month" },
            { "id": "seed-5259-brooklyn-room-6", "name": "Room 6", "floor": "4-Person Bathroom Share", "monthlyRent": 800, "availability": "Available after April 10, 2026", "detail": "4-Bedroom Share (Rooms 6, 7, 8 & 9) - Shares bathroom with Rooms 7, 8, and 9", "furnishing": "Bed, desk, and heating.", "roomAmenitiesText": "Desk\nBed\nHeating", "photoDataUrls": [], "videoDataUrl": null, "utilitiesEstimate": "$175/month" },
            { "id": "seed-5259-brooklyn-room-7", "name": "Room 7", "floor": "4-Person Bathroom Share", "monthlyRent": 800, "availability": "Available after April 10, 2026", "detail": "4-Bedroom Share (Rooms 6, 7, 8 & 9) - Shares bathroom with Rooms 6, 8, and 9", "furnishing": "Bed, desk, and heating.", "roomAmenitiesText": "Desk\nBed\nHeating", "photoDataUrls": [], "videoDataUrl": null, "utilitiesEstimate": "$175/month" },
            { "id": "seed-5259-brooklyn-room-8", "name": "Room 8", "floor": "4-Person Bathroom Share", "monthlyRent": 800, "availability": "Available after April 10, 2026", "detail": "4-Bedroom Share (Rooms 6, 7, 8 & 9) - Shares bathroom with Rooms 6, 7, and 9", "furnishing": "Bed, desk, and heating.", "roomAmenitiesText": "Desk\nBed\nHeating", "photoDataUrls": [], "videoDataUrl": null, "utilitiesEstimate": "$175/month" },
            { "id": "seed-5259-brooklyn-room-9", "name": "Room 9", "floor": "4-Person Bathroom Share", "monthlyRent": 800, "availability": "Available after April 10, 2026", "detail": "4-Bedroom Share (Rooms 6, 7, 8 & 9) - Shares bathroom with Rooms 6, 7, and 8", "furnishing": "Bed, desk, and heating.", "roomAmenitiesText": "Desk\nBed\nHeating", "photoDataUrls": [], "videoDataUrl": null, "utilitiesEstimate": "$175/month" }
          ]
        }
      }
      $json$::jsonb
    )
)
insert into public.manager_property_records (id, manager_user_id, status, row_data, property_data, edit_request_note, updated_at)
select
  seed.id,
  manager.id,
  'live',
  null,
  jsonb_set(seed.property_data, '{managerUserId}', to_jsonb(manager.id::text), true),
  null,
  now()
from seed
cross join manager
on conflict (id) do update
set
  manager_user_id = excluded.manager_user_id,
  status = 'live',
  property_data = excluded.property_data,
  updated_at = now();
