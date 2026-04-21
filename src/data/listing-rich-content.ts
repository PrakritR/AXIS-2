import { listingRichFromManagerSubmission } from "@/data/listing-rich-from-submission";
import { parseMonthlyRent } from "@/lib/listings-search";
import type { MockProperty } from "./types";

export type ListingRoomModal = {
  setupLine: string;
  tourEyebrow: string;
  tourTitle: string;
  tourSubtitle: string;
  includedTags: string[];
  /** Manager-provided furnishing summary (shown in room detail modal). */
  furnishingDetail?: string;
  /** Extra labels from room amenities field (beyond includedTags). */
  roomAmenityLabels?: string[];
  /** Uploaded room photos (data URLs or https) — shown in detail modal when present */
  photoUrls?: string[];
  /** Uploaded room video (data URL or https) — replaces placeholder when present */
  videoSrc?: string | null;
};

export type ListingRoomRow = {
  id: string;
  name: string;
  detail: string;
  price: string;
  availability: string;
  modal: ListingRoomModal;
};

export type ListingFloorCard = {
  floorLabel: string;
  fromPrice: string;
  roomCount: number;
  remainingNote?: string;
  rooms: ListingRoomRow[];
};

export type ListingBathroomModal = {
  eyebrow: string;
  setupCard: string;
  includedTags: string[];
  /** Placeholder “photos” for the gallery strip (no separate video). */
  photoCaptions: string[];
  photoUrls?: string[];
};

export type ListingBathroomRow = {
  id: string;
  name: string;
  detail: string;
  shower: boolean;
  toilet: boolean;
  bathtub: boolean;
  availability: string;
  modal: ListingBathroomModal;
};

export type ListingSharedModal = {
  eyebrow: string;
  tourEyebrow: string;
  tourTitle: string;
  tourSubtitle: string;
  includedTags: string[];
  photoCaptions: string[];
};

export type ListingSharedRow = {
  id: string;
  name: string;
  detail: string;
  useNote: string;
  availability: string;
  modal: ListingSharedModal;
};

export type LeaseBasicRow = {
  id: string;
  icon: string;
  title: string;
  /** Subtitle under title (same role as room “floor” line). */
  detail: string;
  /** Shown in the price column (fee, deposit, “—”, etc.). */
  price: string;
  /** Status / category pill text. */
  status: string;
  body: string;
};

export type AmenityItem = { id: string; icon: string; label: string };

export type BundleCard = {
  id: string;
  label: string;
  price: string;
  strikethrough?: string;
  promo?: string;
  roomsLine: string;
};

export type ListingRichContent = {
  heroTagline: string;
  /** Longer house overview from manager submission; shown under the tagline when set. */
  heroOverview?: string;
  /** House rules / community guidelines for the listing (House rules tab). */
  houseRulesBody?: string;
  priceRangeLabel: string;
  floorPlans: ListingFloorCard[];
  bathrooms: ListingBathroomRow[];
  sharedSpaces: ListingSharedRow[];
  leaseBasics: LeaseBasicRow[];
  amenities: AmenityItem[];
  bundlesText: string;
  bundleCards: BundleCard[];
  quickFacts: { label: string; value: string }[];
};

const roomModal = (partial: Partial<ListingRoomModal> & Pick<ListingRoomModal, "setupLine">): ListingRoomModal => ({
  tourEyebrow: "Room tour",
  tourTitle: "Video placeholder",
  tourSubtitle: "Tour coming soon — swap in hosted video when ready.",
  includedTags: ["Bed", "Desk", "Keypad lock", "Heating", "AC"],
  ...partial,
});

const defaultFloors: ListingFloorCard[] = [
  {
    floorLabel: "First floor",
    fromPrice: "$775/month",
    roomCount: 2,
    remainingNote: "2 rooms on this floor",
    rooms: [
      {
        id: "r1",
        name: "Room 1",
        detail: "First floor · Shares bathroom with the second floor as well",
        price: "$775/month",
        availability: "Available now",
        modal: roomModal({
          setupLine: "Shares bathroom with the second floor as well",
          tourTitle: "Room 1 tour coming soon.",
          tourSubtitle: "Walkthrough placeholder — connect Vimeo, YouTube, or Mux when media is ready.",
          includedTags: ["Bed", "Desk", "Keypad lock", "Heating", "AC", "Shares bathroom with the second floor as well"],
        }),
      },
      {
        id: "r1a",
        name: "Room 1A (flex lease)",
        detail: "First floor · flexible lease lengths",
        price: "$790/month",
        availability: "Available now",
        modal: roomModal({
          setupLine: "Flex lease: 3-month, 9-month, 12-month, or month-to-month (+$25/mo)",
          tourTitle: "Room 1A tour coming soon.",
          tourSubtitle: "Walkthrough placeholder — connect Vimeo, YouTube, or Mux when media is ready.",
          includedTags: ["Bed", "Desk", "Keypad lock", "Heating", "AC", "Flex lease"],
        }),
      },
    ],
  },
  {
    floorLabel: "Second floor",
    fromPrice: "$800/month",
    roomCount: 4,
    rooms: [
      {
        id: "r2",
        name: "Room 2",
        detail: "Second floor",
        price: "$800/month",
        availability: "Available now",
        modal: roomModal({
          setupLine: "Second floor · en-suite bath",
          tourTitle: "Room 2 tour coming soon.",
          includedTags: ["Bed", "Closet", "Heating", "AC", "Private bath"],
        }),
      },
      {
        id: "r3",
        name: "Room 3",
        detail: "Second floor",
        price: "$800/month",
        availability: "Available now",
        modal: roomModal({
          setupLine: "Second floor",
          tourTitle: "Room 3 tour coming soon.",
          includedTags: ["Bed", "Desk", "Heating", "Shared bath"],
        }),
      },
      {
        id: "r4",
        name: "Room 4",
        detail: "Second floor",
        price: "$800/month",
        availability: "Available now",
        modal: roomModal({
          setupLine: "Second floor · shared bath",
          tourTitle: "Room 4 tour coming soon.",
          includedTags: ["Bed", "Closet", "Heating", "Shared bath"],
        }),
      },
      {
        id: "r5",
        name: "Room 5",
        detail: "Second floor",
        price: "$800/month",
        availability: "Available now",
        modal: roomModal({
          setupLine: "Second floor · shared bath",
          tourTitle: "Room 5 tour coming soon.",
          includedTags: ["Bed", "Desk", "Heating", "Shared bath"],
        }),
      },
    ],
  },
];

const defaultBathrooms: ListingBathroomRow[] = [
  {
    id: "b1",
    name: "Full bath (hall)",
    detail: "Between Room 1 and stairs",
    shower: true,
    toilet: true,
    bathtub: true,
    availability: "Available now",
    modal: {
      eyebrow: "First floor",
      setupCard: "Tub · single vanity · shared with 1st & 2nd floor",
      includedTags: ["Shower", "Toilet", "Bathtub", "Vanity", "Exhaust fan"],
      photoCaptions: ["Vanity & mirror", "Tub & shower combo", "Tile detail"],
    },
  },
  {
    id: "b2",
    name: "Three-quarter bath",
    detail: "Second floor landing",
    shower: true,
    toilet: true,
    bathtub: false,
    availability: "Available now",
    modal: {
      eyebrow: "Second floor",
      setupCard: "Walk-in shower · vanity",
      includedTags: ["Shower", "Toilet", "Vanity", "Heated floor"],
      photoCaptions: ["Walk-in shower", "Vanity"],
    },
  },
  {
    id: "b3",
    name: "Powder room",
    detail: "Main level by kitchen",
    shower: false,
    toilet: true,
    bathtub: false,
    availability: "Common area",
    modal: {
      eyebrow: "Main floor",
      setupCard: "Toilet · sink",
      includedTags: ["Toilet", "Sink", "Mirror"],
      photoCaptions: ["Powder room overview"],
    },
  },
];

const defaultShared: ListingSharedRow[] = [
  {
    id: "s1",
    name: "Laundry room",
    detail: "Basement · two washers / two dryers",
    useNote: "Card or app payment · detergent shelf",
    availability: "Shared",
    modal: {
      eyebrow: "Shared space",
      tourEyebrow: "Space tour",
      tourTitle: "Laundry tour coming soon.",
      tourSubtitle: "Video placeholder — washers, dryers, and folding counters.",
      includedTags: ["Washers", "Dryers", "Folding counter", "Utility sink", "Storage"],
      photoCaptions: ["Washer wall", "Folding area", "Detergent storage"],
    },
  },
  {
    id: "s2",
    name: "Chef’s kitchen",
    detail: "Main floor · south exposure",
    useNote: "Full appliances · island seating for 6",
    availability: "Shared",
    modal: {
      eyebrow: "Shared space",
      tourEyebrow: "Space tour",
      tourTitle: "Kitchen walkthrough coming soon.",
      tourSubtitle: "Island, appliances, and pantry — drop in your hosted clip.",
      includedTags: ["Gas range", "Dishwasher", "Island", "Pantry", "Coffee station"],
      photoCaptions: ["Island seating", "Appliance wall", "Pantry"],
    },
  },
  {
    id: "s3",
    name: "Living room",
    detail: "Main floor · open to dining",
    useNote: "Sectional · streaming TV · A/C",
    availability: "Shared",
    modal: {
      eyebrow: "Shared space",
      tourEyebrow: "Space tour",
      tourTitle: "Living room tour coming soon.",
      tourSubtitle: "Seating layout and TV nook placeholder.",
      includedTags: ["Sectional", "Smart TV", "Ceiling fan", "Large windows"],
      photoCaptions: ["Seating area", "TV nook", "Windows"],
    },
  },
  {
    id: "s4",
    name: "Dining room",
    detail: "Main floor",
    useNote: "Seats 8 · adjacent to kitchen",
    availability: "Shared",
    modal: {
      eyebrow: "Shared space",
      tourEyebrow: "Space tour",
      tourTitle: "Dining room tour coming soon.",
      tourSubtitle: "Table, lighting, and flow into kitchen.",
      includedTags: ["8-seat table", "Built-in buffet", "Pendant lighting"],
      photoCaptions: ["Table view", "Buffet wall"],
    },
  },
  {
    id: "s5",
    name: "Movie theater",
    detail: "Lower level",
    useNote: "1080p projector · soundbar · tiered seating",
    availability: "Shared",
    modal: {
      eyebrow: "Shared space",
      tourEyebrow: "Space tour",
      tourTitle: "Theater tour coming soon.",
      tourSubtitle: "Seating and screen — ideal for hosted walkthrough video.",
      includedTags: ["Projector", "Soundbar", "Blackout shades", "Tiered seating"],
      photoCaptions: ["Screen wall", "Seating rows", "Snack ledge"],
    },
  },
  {
    id: "s6",
    name: "Back deck + yard",
    detail: "Ground level",
    useNote: "Grill hookups · bike rack nearby",
    availability: "Shared",
    modal: {
      eyebrow: "Outdoor",
      tourEyebrow: "Space tour",
      tourTitle: "Outdoor tour coming soon.",
      tourSubtitle: "Deck, yard, and grill area.",
      includedTags: ["Deck", "Grill gas line", "Bike rack", "Yard lights"],
      photoCaptions: ["Deck overview", "Grill corner", "Yard"],
    },
  },
];

const defaultLease: LeaseBasicRow[] = [
  {
    id: "lease-terms",
    icon: "📋",
    title: "Lease terms",
    detail: "Set when listing is published",
    price: "—",
    status: "See details",
    body: "Lease lengths and rent details appear here after the property manager completes the listing application. Apply online to choose your term in the rental application.",
  },
  {
    id: "lease-application",
    icon: "📄",
    title: "Application",
    detail: "From listing setup",
    price: "—",
    status: "Due with app",
    body: "Application fee is set in the manager listing form — not shown until that data exists for this property.",
  },
  {
    id: "lease-deposit",
    icon: "🔒",
    title: "Security deposit",
    detail: "From listing setup",
    price: "—",
    status: "At signing",
    body: "Security deposit amount comes from the published listing. Confirm in your lease and with the property manager.",
  },
  {
    id: "lease-movein",
    icon: "🧾",
    title: "Move-in fee",
    detail: "From listing setup",
    price: "—",
    status: "At signing",
    body: "Move-in fee is configured by the property manager on the listing. See the final lease for what it covers.",
  },
  {
    id: "lease-signing",
    icon: "✍️",
    title: "Payment due at signing",
    detail: "Listing or lease",
    price: "—",
    status: "At signing",
    body: "When the listing includes deposit and move-in amounts, the public page can show their sum at signing. Otherwise the lease states the exact figure.",
  },
  {
    id: "lease-utilities",
    icon: "📊",
    title: "Utilities",
    detail: "Listing or your estimate",
    price: "—",
    status: "Estimated",
    body: "Landlords may publish a utilities estimate on the listing. You can also note your expected monthly utilities in the rental application.",
  },
];

const defaultAmenities: AmenityItem[] = [
  { id: "amen-walk", icon: "🚶", label: "Walkable location" },
  { id: "amen-clean", icon: "🧹", label: "Bi-monthly cleaning (twice a month)" },
  { id: "amen-ac-lr", icon: "❄️", label: "A/C in living room only" },
  { id: "amen-fridge", icon: "🧊", label: "Refrigerator" },
  { id: "amen-stove", icon: "🔥", label: "Stove" },
  { id: "amen-laundry", icon: "🧺", label: "In-unit laundry (washer & dryer)" },
  { id: "amen-wifi", icon: "📶", label: "WiFi" },
  { id: "amen-transit", icon: "🚌", label: "Public transportation" },
  { id: "amen-micro", icon: "📦", label: "Microwave" },
  { id: "amen-oven", icon: "🍳", label: "Oven" },
  { id: "amen-desk", icon: "🪑", label: "Desk" },
  { id: "amen-bed", icon: "🛏️", label: "Bed" },
  { id: "amen-heat", icon: "🌡️", label: "Heating" },
  { id: "amen-ac", icon: "🎛️", label: "AC" },
  { id: "amen-dish", icon: "🍽️", label: "Dishwasher" },
  { id: "amen-disposal", icon: "♻️", label: "Garbage disposal" },
  { id: "amen-eq", icon: "🏋️", label: "Fitness center / gym access" },
  { id: "amen-pool", icon: "🏊", label: "Pool / spa" },
  { id: "amen-roof", icon: "🌇", label: "Rooftop / terrace" },
  { id: "amen-pet", icon: "🐕", label: "Pet washing station" },
  { id: "amen-package", icon: "📬", label: "Package lockers" },
  { id: "amen-bike", icon: "🚲", label: "Bike storage" },
  { id: "amen-ev", icon: "🔌", label: "EV charging" },
  { id: "amen-elev", icon: "🛗", label: "Elevator" },
  { id: "amen-security", icon: "🔒", label: "Controlled access / smart locks" },
  { id: "amen-smoke", icon: "💨", label: "Smoke-free building" },
];

/** Shown when the listing uses generated demo content (no manager submission). */
export const DEFAULT_LISTING_HOUSE_RULES_FALLBACK =
  "Quiet hours typically 10pm–8am; confirm with the property manager. No smoking indoors unless posted otherwise. Guests and overnight visitors may require notice — ask before your tour. Shared spaces stay tidy; label food in shared refrigerators.";

const defaultBundles: BundleCard[] = [
  {
    id: "bundle-2f",
    label: "Second floor rental",
    strikethrough: "$3,400/mo",
    price: "$3,200/mo",
    promo: "Promo rate",
    roomsLine: "Room 2 · Room 3 · Room 4 · Room 5",
  },
  {
    id: "bundle-full",
    label: "Full house",
    strikethrough: "$7,175/mo",
    price: "$7,000/mo",
    promo: "Promo rate",
    roomsLine: "All rooms · shared spaces included",
  },
];

export function getListingRichContent(property: MockProperty): ListingRichContent {
  if (property.listingSubmission?.v === 1) {
    return listingRichFromManagerSubmission(property, property.listingSubmission);
  }
  const mid = parseMonthlyRent(property.rentLabel) ?? 875;
  const low = Math.max(500, mid - 125);
  const high = mid + 100;
  return {
    heroTagline: property.tagline,
    houseRulesBody: DEFAULT_LISTING_HOUSE_RULES_FALLBACK,
    priceRangeLabel: `from $${low}–$${high}/mo`,
    floorPlans: defaultFloors,
    bathrooms: defaultBathrooms,
    sharedSpaces: defaultShared,
    leaseBasics: defaultLease,
    amenities: defaultAmenities,
    bundlesText:
      "**Four lease options** are available for every package. Month-to-month renewals add **$25/month** where applicable.",
    bundleCards: defaultBundles,
    quickFacts: [
      { label: "Neighborhood", value: property.neighborhood },
      { label: "Bedrooms", value: String(Math.max(property.beds * 3, 3)) },
      { label: "Bathrooms", value: String(property.baths + 1.5) },
      { label: "Type", value: "Shared housing" },
      { label: "Building", value: property.buildingName },
    ],
  };
}
