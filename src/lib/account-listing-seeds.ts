import type { MockProperty } from "@/data/types";
import { appendExtraListing, readExtraListingsForUser, removeExtraListing } from "@/lib/demo-property-pipeline";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";

const PRAKRIT_LISTING_EMAILS = new Set(["prakritramachandran@gmai.com", "prakritramachandran@gmail.com"]);

function roomIds(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}-room-${i + 1}`);
}

function sharedSpaces(prefix: string, ids: string[]): ManagerListingSubmissionV1["sharedSpaces"] {
  return [
    {
      id: `${prefix}-shared-kitchen`,
      name: "Shared kitchen + living area",
      detail: "Shared kitchen, dining, and lounge spaces for residents.",
      amenitiesText: ["Refrigerator", "Microwave", "Oven / range", "Dishwasher", "Desk / workspace", "TV in common area", "Living / lounge seating"].join(
        "\n",
      ),
      roomAccessIds: ids,
    },
    {
      id: `${prefix}-shared-laundry`,
      name: "In-unit laundry",
      detail: "Laundry is available in the home.",
      amenitiesText: "",
      roomAccessIds: ids,
    },
  ];
}

function bathrooms(prefix: string, count: number, ids: string[]): ManagerListingSubmissionV1["bathrooms"] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-bath-${i + 1}`,
    name: i === 0 ? "Full bath" : `Bathroom ${i + 1}`,
    location: i === 0 ? "Main level" : `Floor ${(i % 3) + 1}`,
    amenitiesText: "",
    shower: true,
    toilet: true,
    bathtub: i === 0,
    assignedRoomIds: ids.filter((_, idx) => idx % count === i),
  }));
}

function baseSubmission(input: {
  prefix: string;
  buildingName: string;
  address: string;
  beds: number;
  bathCount: number;
  tagline: string;
  overview: string;
  leaseTerms: string;
  applicationFee?: string;
  securityDeposit: string;
  moveInFee?: string;
  costs: string;
  rooms: ManagerListingSubmissionV1["rooms"];
  bundles: ManagerListingSubmissionV1["bundles"];
  quickFacts: ManagerListingSubmissionV1["quickFacts"];
  sharedSpaces?: ManagerListingSubmissionV1["sharedSpaces"];
  amenitiesText?: string;
}): ManagerListingSubmissionV1 {
  const ids = input.rooms.map((r) => r.id);
  return {
    v: 1,
    buildingName: input.buildingName,
    address: input.address,
    zip: "98105",
    neighborhood: "University District",
    tagline: input.tagline,
    petFriendly: false,
    houseOverview: input.overview,
    housePhotoDataUrls: [],
    houseRulesText:
      "Shared housing. Keep common areas clean, respect quiet hours, and coordinate guests with housemates. Details can be edited before publishing final terms.",
    leaseTermsBody: input.leaseTerms,
    applicationFee: input.applicationFee ?? "",
    securityDeposit: input.securityDeposit,
    moveInFee: input.moveInFee ?? "First month rent + deposit due at move-in.",
    paymentAtSigningIncludes: ["security_deposit", "first_month_rent"],
    houseCostsDetail: input.costs,
    parkingMonthly: "Street parking",
    hoaMonthly: "",
    otherMonthlyFees: "$25/month for month-to-month leases.",
    sharedSpaces: input.sharedSpaces ?? sharedSpaces(input.prefix, ids),
    amenitiesText:
      input.amenitiesText ??
      "Walkable neighborhood\nNear public transit\nPeriodic cleaning included\nWiFi\nIn-unit laundry\nSome utilities included in rent",
    zellePaymentsEnabled: false,
    zelleContact: "",
    applicationFeeStripeEnabled: true,
    applicationFeeZelleEnabled: false,
    rooms: input.rooms,
    bathrooms: bathrooms(input.prefix, input.bathCount, ids),
    bundles: input.bundles,
    quickFacts: input.quickFacts,
  };
}

function buildSeeds(managerUserId: string): MockProperty[] {
  const aRoomIds = roomIds("seed-4709a", 10);
  const aRooms: ManagerListingSubmissionV1["rooms"] = [
    { id: aRoomIds[0]!, name: "Room 1", floor: "Second Floor", monthlyRent: 800, availability: "Available after January 1, 2027", detail: "Second Floor", furnishing: "Bed, desk, and chair", roomAmenitiesText: "Desk\nBed\nKeypad lock\nHardwood floors\nHeating\nAC", photoDataUrls: [], videoDataUrl: null, utilitiesEstimate: "$175/month" },
    { id: aRoomIds[1]!, name: "Room 2", floor: "Second Floor", monthlyRent: 775, availability: "Available after September 5, 2026", detail: "Second Floor", furnishing: "Bed, desk, and chair", roomAmenitiesText: "Desk\nBed\nKeypad lock\nHardwood floors\nHeating\nAC", photoDataUrls: [], videoDataUrl: null, utilitiesEstimate: "$175/month" },
    { id: aRoomIds[2]!, name: "Room 3", floor: "Second Floor", monthlyRent: 775, availability: "Unavailable", detail: "Second Floor", furnishing: "Bed, desk, and chair", roomAmenitiesText: "Desk\nBed\nKeypad lock\nHardwood floors\nHeating\nAC", photoDataUrls: [], videoDataUrl: null, utilitiesEstimate: "$175/month" },
    { id: aRoomIds[3]!, name: "Room 4", floor: "Second Floor", monthlyRent: 775, availability: "Unavailable", detail: "Second Floor", furnishing: "Bed, desk, and chair", roomAmenitiesText: "Desk\nBed\nKeypad lock\nHardwood floors\nHeating\nAC", photoDataUrls: [], videoDataUrl: null, utilitiesEstimate: "$175/month" },
    { id: aRoomIds[4]!, name: "Room 5", floor: "Third Floor", monthlyRent: 775, availability: "Unavailable", detail: "Third Floor", furnishing: "Bed, desk, and chair", roomAmenitiesText: "Desk\nBed\nKeypad lock\nHardwood floors\nHeating\nAC", photoDataUrls: [], videoDataUrl: null, utilitiesEstimate: "$175/month" },
    { id: aRoomIds[5]!, name: "Room 6", floor: "Third Floor", monthlyRent: 775, availability: "Unavailable", detail: "Third Floor", furnishing: "Bed, desk, and chair", roomAmenitiesText: "Desk\nBed\nKeypad lock\nHardwood floors\nHeating\nAC", photoDataUrls: [], videoDataUrl: null, utilitiesEstimate: "$175/month" },
    { id: aRoomIds[6]!, name: "Room 7", floor: "Third Floor", monthlyRent: 775, availability: "Unavailable", detail: "Third Floor", furnishing: "Bed, desk, and chair", roomAmenitiesText: "Desk\nBed\nKeypad lock\nHardwood floors\nHeating\nAC", photoDataUrls: [], videoDataUrl: null, utilitiesEstimate: "$175/month" },
    { id: aRoomIds[7]!, name: "Room 8", floor: "Third Floor", monthlyRent: 775, availability: "Available now", detail: "Third Floor", furnishing: "Bed, desk, and chair", roomAmenitiesText: "Desk\nBed\nKeypad lock\nHardwood floors\nHeating\nAC", photoDataUrls: [], videoDataUrl: null, utilitiesEstimate: "$175/month" },
    { id: aRoomIds[8]!, name: "Room 9", floor: "First Floor - Room 9", monthlyRent: 750, availability: "Available after September 1, 2026", detail: "First Floor - Room 9", furnishing: "Bed, desk, and chair", roomAmenitiesText: "Desk\nBed\nKeypad lock\nHardwood floors\nHeating\nAC", photoDataUrls: [], videoDataUrl: null, utilitiesEstimate: "$175/month" },
    { id: aRoomIds[9]!, name: "Room 10", floor: "First Floor - Room 10", monthlyRent: 875, availability: "Available after August 10, 2026", detail: "First Floor - Room 10 · Private bathroom", furnishing: "Bed, desk, and chair", roomAmenitiesText: "Desk\nBed\nKeypad lock\nHardwood floors\nHeating\nAC\nPrivate bathroom", photoDataUrls: [], videoDataUrl: null, utilitiesEstimate: "$175/month" },
  ];
  const bRoomIds = roomIds("seed-4709b", 9);
  const bRooms: ManagerListingSubmissionV1["rooms"] = [
    { id: bRoomIds[0]!, name: "Room 1", floor: "First Floor", monthlyRent: 775, availability: "Available now", detail: "First Floor · Shares bathroom with the second floor as well", furnishing: "Bed, desk, heating and AC.", roomAmenitiesText: "Desk\nBed\nHeating\nAC", photoDataUrls: [], videoDataUrl: null, utilitiesEstimate: "$175/month" },
    { id: bRoomIds[1]!, name: "Room 2", floor: "Second Floor", monthlyRent: 800, availability: "Available now", detail: "Second Floor", furnishing: "Bed, desk, heating and AC.", roomAmenitiesText: "Desk\nBed\nHeating\nAC", photoDataUrls: [], videoDataUrl: null, utilitiesEstimate: "$175/month" },
    { id: bRoomIds[2]!, name: "Room 3", floor: "Second Floor", monthlyRent: 800, availability: "Available now", detail: "Second Floor", furnishing: "Bed, desk, heating and AC.", roomAmenitiesText: "Desk\nBed\nHeating\nAC", photoDataUrls: [], videoDataUrl: null, utilitiesEstimate: "$175/month" },
    { id: bRoomIds[3]!, name: "Room 4", floor: "Second Floor", monthlyRent: 800, availability: "Available now", detail: "Second Floor", furnishing: "Bed, desk, heating and AC.", roomAmenitiesText: "Desk\nBed\nHeating\nAC", photoDataUrls: [], videoDataUrl: null, utilitiesEstimate: "$175/month" },
    { id: bRoomIds[4]!, name: "Room 5", floor: "Second Floor", monthlyRent: 800, availability: "Available now", detail: "Second Floor", furnishing: "Bed, desk, heating and AC.", roomAmenitiesText: "Desk\nBed\nHeating\nAC", photoDataUrls: [], videoDataUrl: null, utilitiesEstimate: "$175/month" },
    { id: bRoomIds[5]!, name: "Room 6", floor: "Third Floor", monthlyRent: 800, availability: "Available now", detail: "Third Floor", furnishing: "Bed, desk, heating and AC.", roomAmenitiesText: "Desk\nBed\nHeating\nAC", photoDataUrls: [], videoDataUrl: null, utilitiesEstimate: "$175/month" },
    { id: bRoomIds[6]!, name: "Room 7", floor: "Third Floor", monthlyRent: 800, availability: "Available now", detail: "Third Floor", furnishing: "Bed, desk, heating and AC.", roomAmenitiesText: "Desk\nBed\nHeating\nAC", photoDataUrls: [], videoDataUrl: null, utilitiesEstimate: "$175/month" },
    { id: bRoomIds[7]!, name: "Room 8", floor: "Third Floor", monthlyRent: 800, availability: "Available now", detail: "Third Floor", furnishing: "Bed, desk, heating and AC.", roomAmenitiesText: "Desk\nBed\nHeating\nAC", photoDataUrls: [], videoDataUrl: null, utilitiesEstimate: "$175/month" },
    { id: bRoomIds[8]!, name: "Room 9", floor: "Third Floor", monthlyRent: 800, availability: "Available now", detail: "Third Floor", furnishing: "Bed, desk, heating and AC.", roomAmenitiesText: "Desk\nBed\nHeating\nAC", photoDataUrls: [], videoDataUrl: null, utilitiesEstimate: "$175/month" },
  ];
  const brooklynRoomIds = roomIds("seed-5259-brooklyn", 9);
  const brooklynRooms: ManagerListingSubmissionV1["rooms"] = [
    { id: brooklynRoomIds[0]!, name: "Room 1", floor: "2-Person Bathroom Share", monthlyRent: 865, availability: "Available after April 10, 2026", detail: "2-Bedroom Share (Rooms 1 & 2) · Shares bathroom with Room 2", furnishing: "Bed, desk, and heating.", roomAmenitiesText: "Desk\nBed\nHeating", photoDataUrls: [], videoDataUrl: null, utilitiesEstimate: "$175/month" },
    { id: brooklynRoomIds[1]!, name: "Room 2", floor: "2-Person Bathroom Share", monthlyRent: 865, availability: "Available after April 10, 2026", detail: "2-Bedroom Share (Rooms 1 & 2) · Shares bathroom with Room 1", furnishing: "Bed, desk, and heating.", roomAmenitiesText: "Desk\nBed\nHeating", photoDataUrls: [], videoDataUrl: null, utilitiesEstimate: "$175/month" },
    { id: brooklynRoomIds[2]!, name: "Room 3", floor: "3-Person Bathroom Share", monthlyRent: 825, availability: "Available April 10, 2026-May 15, 2026 and after August 14, 2026", detail: "3-Bedroom Share (Rooms 3, 4 & 5) · Shares bathroom with Rooms 4 and 5", furnishing: "Bed, desk, and heating.", roomAmenitiesText: "Desk\nBed\nHeating", photoDataUrls: [], videoDataUrl: null, utilitiesEstimate: "$175/month" },
    { id: brooklynRoomIds[3]!, name: "Room 4", floor: "3-Person Bathroom Share", monthlyRent: 825, availability: "Available April 10, 2026-May 15, 2026 and after August 14, 2026", detail: "3-Bedroom Share (Rooms 3, 4 & 5) · Shares bathroom with Rooms 3 and 5", furnishing: "Bed, desk, and heating.", roomAmenitiesText: "Desk\nBed\nHeating", photoDataUrls: [], videoDataUrl: null, utilitiesEstimate: "$175/month" },
    { id: brooklynRoomIds[4]!, name: "Room 5", floor: "3-Person Bathroom Share", monthlyRent: 825, availability: "Available after April 10, 2026", detail: "3-Bedroom Share (Rooms 3, 4 & 5) · Shares bathroom with Rooms 3 and 4", furnishing: "Bed, desk, and heating.", roomAmenitiesText: "Desk\nBed\nHeating", photoDataUrls: [], videoDataUrl: null, utilitiesEstimate: "$175/month" },
    { id: brooklynRoomIds[5]!, name: "Room 6", floor: "4-Person Bathroom Share", monthlyRent: 800, availability: "Available after April 10, 2026", detail: "4-Bedroom Share (Rooms 6, 7, 8 & 9) · Shares bathroom with Rooms 7, 8, and 9", furnishing: "Bed, desk, and heating.", roomAmenitiesText: "Desk\nBed\nHeating", photoDataUrls: [], videoDataUrl: null, utilitiesEstimate: "$175/month" },
    { id: brooklynRoomIds[6]!, name: "Room 7", floor: "4-Person Bathroom Share", monthlyRent: 800, availability: "Available after April 10, 2026", detail: "4-Bedroom Share (Rooms 6, 7, 8 & 9) · Shares bathroom with Rooms 6, 8, and 9", furnishing: "Bed, desk, and heating.", roomAmenitiesText: "Desk\nBed\nHeating", photoDataUrls: [], videoDataUrl: null, utilitiesEstimate: "$175/month" },
    { id: brooklynRoomIds[7]!, name: "Room 8", floor: "4-Person Bathroom Share", monthlyRent: 800, availability: "Available after April 10, 2026", detail: "4-Bedroom Share (Rooms 6, 7, 8 & 9) · Shares bathroom with Rooms 6, 7, and 9", furnishing: "Bed, desk, and heating.", roomAmenitiesText: "Desk\nBed\nHeating", photoDataUrls: [], videoDataUrl: null, utilitiesEstimate: "$175/month" },
    { id: brooklynRoomIds[8]!, name: "Room 9", floor: "4-Person Bathroom Share", monthlyRent: 800, availability: "Available after April 10, 2026", detail: "4-Bedroom Share (Rooms 6, 7, 8 & 9) · Shares bathroom with Rooms 6, 7, and 8", furnishing: "Bed, desk, and heating.", roomAmenitiesText: "Desk\nBed\nHeating", photoDataUrls: [], videoDataUrl: null, utilitiesEstimate: "$175/month" },
  ];

  const submissions = [
    baseSubmission({
      prefix: "seed-4709a",
      buildingName: "4709A 8th Ave NE",
      address: "4709A 8th Ave NE, Seattle, WA",
      beds: 10,
      bathCount: 4,
      tagline: "Furnished shared housing near UW with floor and full-house options.",
      overview:
        "Shared housing across 3 floors with 10 bedrooms and 3.5 bathrooms. Rooms are furnished and the home includes in-unit laundry, shared kitchen and living areas, bi-monthly cleaning, and street parking.",
      leaseTerms:
        "Four lease options available: 3-month, 9-month, and 12-month, plus month-to-month with an extra $25/month charge. Start and end dates are flexible — you choose the window that works for you.",
      applicationFee: "$50",
      securityDeposit: "$500",
      moveInFee: "First month rent + $500 deposit",
      costs: "Flat fee: $175/month — includes cleaning (bi-monthly), WiFi, water & trash.",
      rooms: aRooms,
      bundles: [
        {
          id: "seed-4709a-bundle-house",
          label: "Full house",
          price: "$7,625/mo",
          strikethrough: "$7,825/mo",
          promo: "Promo rate",
          roomsLine: "All 10 rooms.",
          includedRoomIds: aRooms.map((r) => r.id),
        },
        {
          id: "seed-4709a-bundle-second",
          label: "Second floor rental",
          price: "$3,100/mo",
          strikethrough: "",
          promo: "",
          roomsLine: "Room 1 · Room 2 · Room 3 · Room 4",
          includedRoomIds: aRooms.slice(0, 4).map((r) => r.id),
        },
        {
          id: "seed-4709a-bundle-third",
          label: "Third floor rental",
          price: "$3,100/mo",
          strikethrough: "",
          promo: "",
          roomsLine: "Room 5 · Room 6 · Room 7 · Room 8",
          includedRoomIds: aRooms.slice(4, 8).map((r) => r.id),
        },
      ],
      quickFacts: [
        { id: "seed-4709a-qf-neighborhood", label: "Neighborhood", value: "Seattle" },
        { id: "seed-4709a-qf-beds", label: "Bedrooms", value: "10" },
        { id: "seed-4709a-qf-baths", label: "Bathrooms", value: "3.5" },
        { id: "seed-4709a-qf-type", label: "Type", value: "Shared housing" },
      ],
      sharedSpaces: [
        {
          id: "seed-4709a-shared-living",
          name: "Living area",
          detail: "Shared lounge and everyday common space for the household. HVAC is centralized; living area is cooled/heated with the house.",
          amenitiesText: ["TV in common area", "Living / lounge seating"].join("\n"),
          roomAccessIds: aRoomIds,
        },
        {
          id: "seed-4709a-shared-kitchen",
          name: "Kitchen",
          detail: "Full shared kitchen for cooking, storage, and shared meals.",
          amenitiesText: ["Refrigerator", "Microwave", "Oven / range", "Dishwasher", "Desk / workspace", "Shared printer"].join("\n"),
          roomAccessIds: aRoomIds,
        },
        {
          id: "seed-4709a-shared-laundry",
          name: "Laundry",
          detail: "Shared laundry for residents (layout varies by floor).",
          amenitiesText: "",
          roomAccessIds: aRoomIds,
        },
      ],
      amenitiesText:
        "Walkable neighborhood\nIn-unit laundry\nPeriodic cleaning included\nWiFi\nAir conditioning\nNear public transit\nParking available",
    }),
    baseSubmission({
      prefix: "seed-4709b",
      buildingName: "4709B 8th Ave NE",
      address: "4709B 8th Ave NE, Seattle, WA",
      beds: 9,
      bathCount: 3,
      tagline: "Immediate shared-housing inventory in a walkable Seattle location.",
      overview:
        "Shared housing in a multi-floor home with 9 bedrooms and 2.5 bathrooms. Furnished rooms, shared bathrooms across floors, in-unit laundry, kitchen, and lounge.",
      leaseTerms:
        "Four lease options available: 3-month, 9-month, and 12-month, plus month-to-month with an extra $25/month charge. Start and end dates are flexible — you choose the window that works for you.",
      applicationFee: "$50",
      securityDeposit: "$500",
      moveInFee: "First month rent + $500 deposit",
      costs: "Flat fee: $175/month — includes cleaning (bi-monthly), WiFi, water & trash.",
      rooms: bRooms,
      bundles: [
        {
          id: "seed-4709b-bundle-house",
          label: "Full house",
          price: "$7,000/mo",
          strikethrough: "$7,175/mo",
          promo: "Promo rate",
          roomsLine: "All 9 rooms.",
          includedRoomIds: bRooms.map((r) => r.id),
        },
        {
          id: "seed-4709b-bundle-second",
          label: "Second floor rental",
          price: "$3,200/mo",
          strikethrough: "",
          promo: "",
          roomsLine: "Room 2 · Room 3 · Room 4 · Room 5",
          includedRoomIds: bRooms.slice(1, 5).map((r) => r.id),
        },
        {
          id: "seed-4709b-bundle-third",
          label: "Third floor rental",
          price: "$3,200/mo",
          strikethrough: "",
          promo: "",
          roomsLine: "Room 6 · Room 7 · Room 8 · Room 9",
          includedRoomIds: bRooms.slice(5, 9).map((r) => r.id),
        },
      ],
      quickFacts: [
        { id: "seed-4709b-qf-neighborhood", label: "Neighborhood", value: "Seattle" },
        { id: "seed-4709b-qf-beds", label: "Bedrooms", value: "9" },
        { id: "seed-4709b-qf-baths", label: "Bathrooms", value: "2.5" },
        { id: "seed-4709b-qf-type", label: "Type", value: "Shared housing" },
      ],
      sharedSpaces: [
        {
          id: "seed-4709b-shared-living",
          name: "Living area",
          detail: "Shared lounge and everyday common space for the household. HVAC is centralized; living area is cooled/heated with the house.",
          amenitiesText: ["TV in common area", "Living / lounge seating"].join("\n"),
          roomAccessIds: bRoomIds,
        },
        {
          id: "seed-4709b-shared-kitchen",
          name: "Kitchen",
          detail: "Full shared kitchen for cooking, storage, and shared meals.",
          amenitiesText: ["Refrigerator", "Microwave", "Oven / range", "Dishwasher", "Desk / workspace", "Shared printer"].join("\n"),
          roomAccessIds: bRoomIds,
        },
        {
          id: "seed-4709b-shared-laundry",
          name: "Laundry",
          detail: "Shared laundry for residents (layout varies by floor).",
          amenitiesText: "",
          roomAccessIds: bRoomIds,
        },
      ],
      amenitiesText:
        "Walkable neighborhood\nIn-unit laundry\nPeriodic cleaning included\nWiFi\nAir conditioning\nNear public transit\nParking available",
    }),
    baseSubmission({
      prefix: "seed-5259-brooklyn",
      buildingName: "5259 Brooklyn Ave NE",
      address: "5259 Brooklyn Ave NE, Seattle, WA",
      beds: 9,
      bathCount: 3,
      tagline: "University District shared housing near UW, transit, and food.",
      overview:
        "Shared housing near UW with 9 bedrooms and 3 bathrooms. Furnished rooms, grouped shared bathrooms, in-unit laundry, package storage, and walkable access to transit and food.",
      leaseTerms:
        "Four lease options available: 3-month, 9-month, and 12-month, plus month-to-month with an extra $25/month charge. Start and end dates are flexible — you choose the window that works for you.",
      applicationFee: "$50",
      securityDeposit: "$600",
      moveInFee: "First month rent + $600 deposit",
      costs: "Flat fee: $175/month — includes cleaning (bi-monthly), WiFi, water & trash.",
      rooms: brooklynRooms,
      bundles: [
        {
          id: "seed-5259-brooklyn-bundle-house",
          label: "Full house",
          price: "$7,225/mo",
          strikethrough: "$7,405/mo",
          promo: "Promo rate",
          roomsLine: "All 9 rooms.",
          includedRoomIds: brooklynRooms.map((r) => r.id),
        },
        {
          id: "seed-5259-brooklyn-bundle-2",
          label: "Rooms 1 + 2 rental",
          price: "$1,730/mo",
          strikethrough: "",
          promo: "",
          roomsLine: "Room 1 · Room 2",
          includedRoomIds: brooklynRooms.slice(0, 2).map((r) => r.id),
        },
        {
          id: "seed-5259-brooklyn-bundle-3",
          label: "Rooms 3-5 rental",
          price: "$2,475/mo",
          strikethrough: "",
          promo: "",
          roomsLine: "Room 3 · Room 4 · Room 5",
          includedRoomIds: brooklynRooms.slice(2, 5).map((r) => r.id),
        },
        {
          id: "seed-5259-brooklyn-bundle-4",
          label: "Rooms 6 - 9 rental",
          price: "$3,200/mo",
          strikethrough: "",
          promo: "",
          roomsLine: "Room 6 · Room 7 · Room 8 · Room 9",
          includedRoomIds: brooklynRooms.slice(5, 9).map((r) => r.id),
        },
      ],
      quickFacts: [
        { id: "seed-5259-brooklyn-qf-neighborhood", label: "Neighborhood", value: "Seattle" },
        { id: "seed-5259-brooklyn-qf-beds", label: "Bedrooms", value: "9" },
        { id: "seed-5259-brooklyn-qf-baths", label: "Bathrooms", value: "3" },
        { id: "seed-5259-brooklyn-qf-type", label: "Type", value: "Shared housing" },
      ],
      sharedSpaces: [
        {
          id: "seed-5259-brooklyn-shared-living",
          name: "Living area",
          detail: "Shared lounge and everyday common space for the household. HVAC is centralized; living area is cooled/heated with the house.",
          amenitiesText: ["TV in common area", "Living / lounge seating"].join("\n"),
          roomAccessIds: brooklynRoomIds,
        },
        {
          id: "seed-5259-brooklyn-shared-kitchen",
          name: "Kitchen",
          detail: "Full shared kitchen for cooking, storage, and shared meals.",
          amenitiesText: ["Refrigerator", "Microwave", "Oven / range", "Dishwasher", "Desk / workspace", "Shared printer"].join("\n"),
          roomAccessIds: brooklynRoomIds,
        },
        {
          id: "seed-5259-brooklyn-shared-laundry",
          name: "Laundry",
          detail: "Shared laundry for residents (layout varies by floor).",
          amenitiesText: "",
          roomAccessIds: brooklynRoomIds,
        },
      ],
      amenitiesText:
        "Walkable neighborhood\nIn-unit laundry\nPeriodic cleaning included\nWiFi\nAir conditioning\nNear public transit\nParking available\nPackage Storage",
    }),
  ];

  return [
    {
      id: "mgr-seed-4709a-8th-ave-ne",
      title: "4709A 8th Ave NE · 10 rooms",
      tagline: submissions[0]!.tagline,
      address: submissions[0]!.address,
      zip: "98105",
      neighborhood: "University District",
      beds: 10,
      baths: 3.5,
      rentLabel: "$750-$875 / mo",
      available: "Aug 2026 - Jan 2027",
      petFriendly: false,
      buildingId: "mgr-bld-4709a-8th-ave-ne",
      buildingName: "4709A 8th Ave NE",
      unitLabel: "10 rooms",
      mapLat: 47.66348,
      mapLng: -122.31962,
      listingSubmission: submissions[0],
      managerUserId,
      adminPublishLive: true,
    },
    {
      id: "mgr-seed-4709b-8th-ave-ne",
      title: "4709B 8th Ave NE · 9 rooms",
      tagline: submissions[1]!.tagline,
      address: submissions[1]!.address,
      zip: "98105",
      neighborhood: "University District",
      beds: 9,
      baths: 2.5,
      rentLabel: "$775-$800 / mo",
      available: "Now",
      petFriendly: false,
      buildingId: "mgr-bld-4709b-8th-ave-ne",
      buildingName: "4709B 8th Ave NE",
      unitLabel: "9 rooms",
      mapLat: 47.66348,
      mapLng: -122.31962,
      listingSubmission: submissions[1],
      managerUserId,
      adminPublishLive: true,
    },
    {
      id: "mgr-seed-5259-brooklyn-ave-ne",
      title: "5259 Brooklyn Ave NE · 9 rooms",
      tagline: submissions[2]!.tagline,
      address: submissions[2]!.address,
      zip: "98105",
      neighborhood: "University District",
      beds: 9,
      baths: 3,
      rentLabel: "$800-$865 / mo",
      available: "April 2026",
      petFriendly: false,
      buildingId: "mgr-bld-5259-brooklyn-ave-ne",
      buildingName: "5259 Brooklyn Ave NE",
      unitLabel: "9 rooms",
      mapLat: 47.66735,
      mapLng: -122.31461,
      listingSubmission: submissions[2],
      managerUserId,
      adminPublishLive: true,
    },
  ];
}

export function ensureAccountListingSeeds(userId: string | null, email: string | null): boolean {
  if (!userId || !email || !PRAKRIT_LISTING_EMAILS.has(email.trim().toLowerCase())) return false;
  const existing = readExtraListingsForUser(userId);
  const seeds = buildSeeds(userId);
  const updated4709a = seeds.find((p) => p.id === "mgr-seed-4709a-8th-ave-ne");
  const current4709a = existing.find((p) => p.id === "mgr-seed-4709a-8th-ave-ne");
  const updated4709b = seeds.find((p) => p.id === "mgr-seed-4709b-8th-ave-ne");
  const current4709b = existing.find((p) => p.id === "mgr-seed-4709b-8th-ave-ne");
  const updatedBrooklyn = seeds.find((p) => p.id === "mgr-seed-5259-brooklyn-ave-ne");
  const currentBrooklyn = existing.find((p) => p.id === "mgr-seed-5259-brooklyn-ave-ne");
  let changed = false;
  if (
    updated4709a &&
    current4709a &&
    current4709a.listingSubmission?.rooms?.[0]?.availability !== "Available after January 1, 2027"
  ) {
    removeExtraListing(updated4709a.id);
    appendExtraListing(updated4709a, userId);
    changed = true;
  }
  if (
    updated4709b &&
    current4709b &&
    current4709b.listingSubmission?.rooms?.[0]?.detail !== "First Floor · Shares bathroom with the second floor as well"
  ) {
    removeExtraListing(updated4709b.id);
    appendExtraListing(updated4709b, userId);
    changed = true;
  }
  if (
    updatedBrooklyn &&
    currentBrooklyn &&
    currentBrooklyn.listingSubmission?.rooms?.[0]?.floor !== "2-Person Bathroom Share"
  ) {
    removeExtraListing(updatedBrooklyn.id);
    appendExtraListing(updatedBrooklyn, userId);
    changed = true;
  }

  const refreshed = changed ? readExtraListingsForUser(userId) : existing;
  const existingIds = new Set(refreshed.map((p) => p.id));
  const missingSeeds = seeds.filter((p) => !existingIds.has(p.id));
  for (const seed of missingSeeds) {
    appendExtraListing(seed, userId);
    changed = true;
  }
  return changed;
}
