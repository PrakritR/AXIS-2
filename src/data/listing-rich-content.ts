import { parseMonthlyRent } from "@/lib/listings-search";
import type { MockProperty } from "./types";

export type ListingRoomModal = {
  setupLine: string;
  tourEyebrow: string;
  tourTitle: string;
  tourSubtitle: string;
  includedTags: string[];
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
  hiddenRoomNames?: string[];
};

export type ListingBathroomModal = {
  eyebrow: string;
  setupCard: string;
  includedTags: string[];
  /** Placeholder “photos” for the gallery strip (no separate video). */
  photoCaptions: string[];
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
  icon: string;
  title: string;
  body: string;
};

export type AmenityItem = { icon: string; label: string };

export type BundleCard = {
  label: string;
  price: string;
  strikethrough?: string;
  promo?: string;
  roomsLine: string;
};

export type ListingRichContent = {
  heroTagline: string;
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
    roomCount: 1,
    remainingNote: "1 room remaining at this price",
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
    ],
    hiddenRoomNames: ["Room 1A (flex lease)"],
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
    ],
    hiddenRoomNames: ["Room 4", "Room 5"],
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
    icon: "📋",
    title: "Lease terms",
    body: "Four lease options available: 3-month, 9-month, and 12-month, plus month-to-month with an extra $25/month charge. Start and end dates are flexible — you choose the window that works for you.",
  },
  { icon: "📄", title: "Application", body: "Fee: $50 (demo)" },
  { icon: "💵", title: "Move-in charges", body: "First month rent + $500 deposit" },
  { icon: "🔒", title: "Security deposit", body: "$500" },
  { icon: "📊", title: "Utilities", body: "Flat $95/mo community utilities estimate (mock)." },
];

const defaultAmenities: AmenityItem[] = [
  { icon: "🚶", label: "Walkable location" },
  { icon: "🧹", label: "Bi-monthly cleaning (twice a month)" },
  { icon: "❄️", label: "A/C in living room only" },
  { icon: "🧊", label: "Refrigerator" },
  { icon: "🔥", label: "Stove" },
  { icon: "🧺", label: "In-unit laundry (washer & dryer)" },
  { icon: "📶", label: "WiFi" },
  { icon: "🚌", label: "Public transportation" },
  { icon: "📦", label: "Microwave" },
  { icon: "🍳", label: "Oven" },
  { icon: "🪑", label: "Desk" },
  { icon: "🛏️", label: "Bed" },
  { icon: "🌡️", label: "Heating" },
  { icon: "🎛️", label: "AC" },
];

const defaultBundles: BundleCard[] = [
  {
    label: "Second floor rental",
    strikethrough: "$3,400/mo",
    price: "$3,200/mo",
    promo: "Promo rate",
    roomsLine: "Room 2 · Room 3 · Room 4 · Room 5",
  },
  {
    label: "Full house",
    strikethrough: "$7,175/mo",
    price: "$7,000/mo",
    promo: "Promo rate",
    roomsLine: "All rooms · shared spaces included",
  },
];

export function getListingRichContent(property: MockProperty): ListingRichContent {
  const mid = parseMonthlyRent(property.rentLabel) ?? 875;
  const low = Math.max(500, mid - 125);
  const high = mid + 100;
  return {
    heroTagline: property.tagline,
    priceRangeLabel: `from $${low}–$${high}/mo`,
    floorPlans: defaultFloors,
    bathrooms: defaultBathrooms,
    sharedSpaces: defaultShared,
    leaseBasics: defaultLease,
    amenities: defaultAmenities,
    bundlesText:
      "**Four lease options** are available for every package. Month-to-month renewals add **$25/month** in this demo copy.",
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
