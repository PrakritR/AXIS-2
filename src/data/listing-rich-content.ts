import { parseMonthlyRent } from "@/lib/listings-search";
import type { MockProperty } from "./types";

export type ListingRoomRow = {
  id: string;
  name: string;
  detail: string;
  price: string;
  availability: string;
};

export type ListingFloorCard = {
  floorLabel: string;
  fromPrice: string;
  roomCount: number;
  remainingNote?: string;
  rooms: ListingRoomRow[];
  hiddenRoomNames?: string[];
};

export type ListingBathroomRow = {
  id: string;
  name: string;
  detail: string;
  setup: string;
  availability: string;
};

export type ListingSharedRow = {
  id: string;
  name: string;
  detail: string;
  useNote: string;
  availability: string;
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
      },
      {
        id: "r3",
        name: "Room 3",
        detail: "Second floor",
        price: "$800/month",
        availability: "Available now",
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
    setup: "Tub · single vanity · shared with 1st & 2nd floor",
    availability: "Available now",
  },
  {
    id: "b2",
    name: "Three-quarter bath",
    detail: "Second floor landing",
    setup: "Walk-in shower · vanity",
    availability: "Available now",
  },
  {
    id: "b3",
    name: "Powder room",
    detail: "Main level by kitchen",
    setup: "Toilet · sink",
    availability: "Common area",
  },
];

const defaultShared: ListingSharedRow[] = [
  {
    id: "s1",
    name: "Chef’s kitchen",
    detail: "Main floor · south exposure",
    useNote: "Full appliances · island seating for 6",
    availability: "Shared",
  },
  {
    id: "s2",
    name: "Living room & TV nook",
    detail: "Main floor",
    useNote: "Sectional · streaming TV · A/C in space",
    availability: "Shared",
  },
  {
    id: "s3",
    name: "Back deck + yard",
    detail: "Ground level",
    useNote: "Grill hookups · bike rack nearby",
    availability: "Shared",
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
