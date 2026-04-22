import type { MockProperty } from "@/data/types";
import { appendExtraListing, readExtraListingsForUser } from "@/lib/demo-property-pipeline";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";

const PRAKRIT_LISTING_EMAILS = new Set(["prakritramachandran@gmai.com", "prakritramachandran@gmail.com"]);

function roomIds(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}-room-${i + 1}`);
}

function makeRooms({
  prefix,
  count,
  rents,
  availability,
  detail,
  utilities = "$175/month utilities (WiFi, cleaning, water, trash).",
}: {
  prefix: string;
  count: number;
  rents: number[];
  availability: string;
  detail: string;
  utilities?: string;
}): ManagerListingSubmissionV1["rooms"] {
  const floors = ["Floor 1", "Floor 2", "Floor 3"];
  return roomIds(prefix, count).map((id, i) => ({
    id,
    name: `Room ${i + 1}`,
    floor: floors[i % floors.length]!,
    monthlyRent: rents[i % rents.length]!,
    availability,
    detail,
    furnishing: "Fully furnished room with bed, desk, heating/AC.",
    roomAmenitiesText: "Bed\nDesk\nHeating/AC\nFurnished",
    photoDataUrls: [],
    videoDataUrl: null,
    utilitiesEstimate: utilities,
  }));
}

function sharedSpaces(prefix: string, ids: string[]): ManagerListingSubmissionV1["sharedSpaces"] {
  return [
    {
      id: `${prefix}-shared-kitchen`,
      name: "Shared kitchen + living area",
      detail: "Shared kitchen, dining, and lounge spaces for residents.",
      roomAccessIds: ids,
    },
    {
      id: `${prefix}-shared-laundry`,
      name: "In-unit laundry",
      detail: "Laundry is available in the home.",
      roomAccessIds: ids,
    },
  ];
}

function bathrooms(prefix: string, count: number, ids: string[]): ManagerListingSubmissionV1["bathrooms"] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-bath-${i + 1}`,
    name: i === 0 ? "Full bath" : `Bathroom ${i + 1}`,
    location: i === 0 ? "Main level" : `Floor ${(i % 3) + 1}`,
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
  securityDeposit: string;
  costs: string;
  rooms: ManagerListingSubmissionV1["rooms"];
  bundles: ManagerListingSubmissionV1["bundles"];
  quickFacts: ManagerListingSubmissionV1["quickFacts"];
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
    applicationFee: "",
    securityDeposit: input.securityDeposit,
    moveInFee: "First month rent + deposit due at move-in.",
    paymentAtSigningIncludes: ["security_deposit", "first_month_rent"],
    houseCostsDetail: input.costs,
    parkingMonthly: "Street parking",
    hoaMonthly: "",
    otherMonthlyFees: "$25/month for month-to-month leases.",
    sharedSpaces: sharedSpaces(input.prefix, ids),
    amenitiesText: "Fully furnished rooms\nIn-unit laundry\nShared kitchen\nShared lounge\nBi-monthly cleaning\nWalkable location",
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
  const aRooms = makeRooms({
    prefix: "seed-4709a",
    count: 10,
    rents: [750, 775, 800, 825, 850, 875],
    availability: "Future move-ins from Aug 2026 - Jan 2027; limited rooms currently available.",
    detail: "Furnished shared-housing room. One private bath room may be available at $875/month.",
  });
  const bRooms = makeRooms({
    prefix: "seed-4709b",
    count: 9,
    rents: [775, 800],
    availability: "Most rooms available now.",
    detail: "Furnished shared-housing room with shared bathrooms across floors.",
  });
  const brooklynRooms = makeRooms({
    prefix: "seed-5259-brooklyn",
    count: 9,
    rents: [865, 825, 800],
    availability: "Many rooms open starting April 2026; some spring/summer date windows are limited.",
    detail: "Furnished room near UW with bathroom groups based on room share.",
  });

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
      leaseTerms: "3, 9, 12-month, or month-to-month leases (+$25/month). Deposit is $500. Move-in is first month rent plus deposit.",
      securityDeposit: "$500",
      costs: "Rooms are $750-$875/month. Utilities are $175/month and include WiFi, cleaning, water, and trash.",
      rooms: aRooms,
      bundles: [
        {
          id: "seed-4709a-bundle-floor",
          label: "Floor bundle",
          price: "Varies by floor",
          strikethrough: "",
          promo: "Rent an entire floor.",
          roomsLine: "Floor bundles available.",
          includedRoomIds: [],
        },
        {
          id: "seed-4709a-bundle-house",
          label: "Full house",
          price: "~$7,600/month",
          strikethrough: "",
          promo: "Whole-house option.",
          roomsLine: "All 10 rooms.",
          includedRoomIds: aRooms.map((r) => r.id),
        },
      ],
      quickFacts: [
        { id: "seed-4709a-qf-type", label: "Type", value: "Shared Housing" },
        { id: "seed-4709a-qf-layout", label: "Layout", value: "3 floors" },
        { id: "seed-4709a-qf-beds", label: "Bedrooms", value: "10" },
        { id: "seed-4709a-qf-baths", label: "Bathrooms", value: "3.5" },
      ],
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
      leaseTerms: "3, 9, 12-month, or month-to-month leases (+$25/month). Deposit is $500.",
      securityDeposit: "$500",
      costs: "Rooms are $775-$800/month. Utilities are $175/month.",
      rooms: bRooms,
      bundles: [
        {
          id: "seed-4709b-bundle-floor",
          label: "Floor group",
          price: "Varies by floor",
          strikethrough: "",
          promo: "Floor group leasing available.",
          roomsLine: "Group rooms by floor.",
          includedRoomIds: [],
        },
        {
          id: "seed-4709b-bundle-house",
          label: "Full house",
          price: "~$7,000/month",
          strikethrough: "",
          promo: "Promo full-house option.",
          roomsLine: "All 9 rooms.",
          includedRoomIds: bRooms.map((r) => r.id),
        },
      ],
      quickFacts: [
        { id: "seed-4709b-qf-type", label: "Type", value: "Shared Housing" },
        { id: "seed-4709b-qf-layout", label: "Layout", value: "Multi-floor" },
        { id: "seed-4709b-qf-beds", label: "Bedrooms", value: "9" },
        { id: "seed-4709b-qf-baths", label: "Bathrooms", value: "2.5" },
      ],
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
      leaseTerms: "3, 9, 12-month, or month-to-month leases (+$25/month). Deposit is $600.",
      securityDeposit: "$600",
      costs: "2-person bath share: $865/month. 3-person share: $825/month. 4-person share: $800/month. Utilities are $175/month.",
      rooms: brooklynRooms,
      bundles: [
        {
          id: "seed-5259-brooklyn-bundle-2",
          label: "2-room bundle",
          price: "From $865/month per room",
          strikethrough: "",
          promo: "Group leasing.",
          roomsLine: "2-person bathroom share.",
          includedRoomIds: brooklynRooms.slice(0, 2).map((r) => r.id),
        },
        {
          id: "seed-5259-brooklyn-bundle-3",
          label: "3-room bundle",
          price: "From $825/month per room",
          strikethrough: "",
          promo: "Group leasing.",
          roomsLine: "3-person bathroom share.",
          includedRoomIds: brooklynRooms.slice(2, 5).map((r) => r.id),
        },
        {
          id: "seed-5259-brooklyn-bundle-house",
          label: "Full house",
          price: "~$7,200/month",
          strikethrough: "",
          promo: "Whole-house option.",
          roomsLine: "All 9 rooms.",
          includedRoomIds: brooklynRooms.map((r) => r.id),
        },
      ],
      quickFacts: [
        { id: "seed-5259-brooklyn-qf-type", label: "Type", value: "Shared Housing" },
        { id: "seed-5259-brooklyn-qf-location", label: "Location", value: "University District near UW" },
        { id: "seed-5259-brooklyn-qf-beds", label: "Bedrooms", value: "9" },
        { id: "seed-5259-brooklyn-qf-baths", label: "Bathrooms", value: "3" },
      ],
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
      mapLat: 47.66415,
      mapLng: -122.32082,
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
      mapLat: 47.66415,
      mapLng: -122.32082,
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
  const existingIds = new Set(existing.map((p) => p.id));
  const seeds = buildSeeds(userId).filter((p) => !existingIds.has(p.id));
  if (seeds.length === 0) return false;
  for (const seed of seeds) appendExtraListing(seed, userId);
  return true;
}
