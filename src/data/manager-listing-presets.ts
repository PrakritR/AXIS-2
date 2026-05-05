/** Preset labels stored as lines in `amenitiesText` / `roomAmenitiesText` / shared & bath amenity fields (toggle sync in form). */

/** Whole-property / neighborhood / building — shown only on the final Amenities step. */
export const HOUSE_WIDE_AMENITY_PRESETS = [
  { id: "wifi", label: "WiFi" },
  { id: "in-unit-laundry", label: "In-unit laundry" },
  { id: "in-building-laundry", label: "In-building laundry" },
  { id: "heating", label: "Heating" },
  { id: "ac", label: "Air conditioning" },
  { id: "bike-storage", label: "Bike storage" },
  { id: "ev-charging", label: "EV charging" },
  { id: "elevator", label: "Elevator" },
  { id: "roof-deck", label: "Roof deck / terrace" },
  { id: "yard", label: "Yard / patio" },
  { id: "smart-locks", label: "Smart locks / keyless entry" },
  { id: "security", label: "Controlled building access" },
  { id: "gym", label: "Fitness / gym access" },
  { id: "concierge", label: "Concierge / front desk" },
  { id: "cleaning", label: "Periodic cleaning included" },
  { id: "utilities-included", label: "Some utilities included in rent" },
  { id: "walkable", label: "Walkable neighborhood" },
  { id: "transit", label: "Near public transit" },
  { id: "parking-available", label: "Parking available" },
] as const;

/**
 * Kitchen appliances, workspace, and common-area items — use on Shared spaces rows (not the house-wide grid).
 * Labels here are stripped from legacy `amenitiesText` on the public listing so they appear under the right space.
 */
export const SHARED_SPACE_AMENITY_PRESETS = [
  // Kitchen
  { id: "fridge", label: "Refrigerator" },
  { id: "freezer", label: "Freezer" },
  { id: "oven-range", label: "Oven / range" },
  { id: "microwave", label: "Microwave" },
  { id: "dishwasher", label: "Dishwasher" },
  { id: "coffee-station", label: "Coffee station" },
  { id: "toaster-oven", label: "Toaster / toaster oven" },
  { id: "island", label: "Kitchen island" },
  { id: "pantry", label: "Pantry storage" },
  // Dining & living
  { id: "dining-table", label: "Dining table & chairs" },
  { id: "sofa", label: "Couch / sofa" },
  { id: "smart-tv", label: "Smart TV" },
  { id: "coffee-table", label: "Coffee table" },
  // Laundry
  { id: "washer-dryer", label: "Washer / dryer" },
  { id: "laundry-sink", label: "Laundry sink" },
  // Work
  { id: "desk", label: "Desk / workspace" },
  { id: "office-chair", label: "Office chair" },
  { id: "printer", label: "Shared printer" },
  // Outdoor
  { id: "patio-seating", label: "Patio / deck seating" },
  { id: "bbq-grill", label: "BBQ grill" },
  { id: "fire-pit", label: "Fire pit" },
  // Storage & extras
  { id: "storage-locker", label: "Personal storage locker" },
  { id: "bike-storage", label: "Bike storage" },
  { id: "gym-equipment", label: "Gym / exercise equipment" },
  { id: "pool", label: "Pool" },
  { id: "hot-tub", label: "Hot tub / jacuzzi" },
  { id: "pool-table", label: "Pool / billiards table" },
  { id: "parking-spot", label: "Parking spot" },
] as const;

/** Fixtures & finishes specific to a bathroom row. */
export const BATHROOM_EXTRA_AMENITY_PRESETS = [
  { id: "dual-vanity", label: "Dual vanities" },
  { id: "walk-in-shower", label: "Walk-in / large shower" },
  { id: "soaking-tub", label: "Soaking tub" },
  { id: "heated-floor", label: "Heated floors" },
  { id: "bath-window", label: "Window / natural light" },
  { id: "vent-fan", label: "Exhaust fan" },
  { id: "storage", label: "Built-in storage / linen" },
] as const;

export const DISALLOWED_BATHROOM_AMENITY_LABELS = new Set(["Shower", "Toilet", "Bathtub"]);

/** @deprecated Use HOUSE_WIDE_AMENITY_PRESETS — kept as alias for older imports/tests. */
export const LISTING_AMENITY_PRESETS = [
  ...HOUSE_WIDE_AMENITY_PRESETS,
  ...SHARED_SPACE_AMENITY_PRESETS,
] as const;

/** Labels that used to live on the house amenity list and should not duplicate on the main grid when present in legacy `amenitiesText`. */
export const LEGACY_HOUSE_AMENITY_LABELS_IN_SHARED_PRESETS = new Set([
  ...SHARED_SPACE_AMENITY_PRESETS.map((p) => p.label),
  "Desk", // legacy label before "Desk / workspace"
]);

export const ROOM_AMENITY_PRESETS = [
  { id: "closet", label: "Walk-in closet" },
  { id: "blackout", label: "Blackout curtains" },
  { id: "usb", label: "USB outlets" },
  { id: "fan", label: "Ceiling fan" },
  { id: "mini-fridge", label: "Mini fridge" },
  { id: "sink", label: "Private sink / vanity" },
  { id: "balcony", label: "Balcony / bay window" },
  { id: "hardwood", label: "Hardwood floors" },
  { id: "keypad", label: "Keypad lock" },
] as const;

export const ROOM_FURNITURE_PRESETS = [
  { id: "bed", label: "Bed" },
  { id: "desk", label: "Desk" },
  { id: "chair", label: "Chair" },
  { id: "dresser", label: "Dresser" },
  { id: "wardrobe", label: "Wardrobe" },
  { id: "nightstand", label: "Nightstand" },
  { id: "bookshelf", label: "Bookshelf" },
  { id: "mirror", label: "Mirror" },
] as const;

const FURNITURE_LABEL_BY_LOWER = new Map(
  ROOM_FURNITURE_PRESETS.map((p) => [p.label.toLowerCase(), p.label] as const),
);

export const DISALLOWED_ROOM_AMENITY_LABELS = new Set(["Bed", "Desk", "Private bathroom"]);

export function sanitizeRoomAmenityText(text: string): string {
  return splitLineList(text)
    .filter((line) => !DISALLOWED_ROOM_AMENITY_LABELS.has(line))
    .join("\n");
}

export const ROOM_AVAILABILITY_OPTIONS = [
  "Available now",
  "Available soon",
  "Waitlist",
  "Signed — not available",
  "Unavailable",
] as const;

export const ROOM_FURNISHING_OPTIONS = [
  { value: "", label: "Select" },
  { value: "Unfurnished", label: "Unfurnished" },
  { value: "Bed only", label: "Bed only" },
  { value: "Bed and desk", label: "Bed and desk" },
  { value: "Bed, desk, and chair", label: "Bed, desk, and chair" },
  { value: "Partially furnished", label: "Partially furnished" },
  { value: "Fully furnished", label: "Fully furnished" },
] as const;

/** Known single-value furnishing presets (not ""). */
const FURNISHING_KNOWN: Set<string> = new Set(
  ROOM_FURNISHING_OPTIONS.map((o) => o.value).filter((v) => Boolean(v)) as string[],
);

export function splitLineList(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function mergeToggleLine(existing: string, label: string, on: boolean): string {
  const set = new Set(splitLineList(existing));
  if (on) set.add(label);
  else set.delete(label);
  return [...set].join("\n");
}

/** Toggle an individual furniture item; clears the "Unfurnished" sentinel. */
export function mergeFurnitureToggle(existing: string, label: string, on: boolean): string {
  const normalized = existing
    .replace(/\b(and|&)\b/gi, ",")
    .split(/[\n,]+/)
    .map((s) => s.trim().replace(/^(and|&)\s+/i, ""))
    .filter(Boolean)
    .filter((s) => s.toLowerCase() !== "unfurnished");
  const set = new Set<string>();
  for (const token of normalized) {
    const canonical = FURNITURE_LABEL_BY_LOWER.get(token.toLowerCase()) ?? token;
    set.add(canonical);
  }
  if (on) set.add(label);
  else set.delete(label);
  return ROOM_FURNITURE_PRESETS.map((p) => p.label)
    .filter((item) => set.has(item))
    .join(", ");
}

/** Case-insensitive: which furniture preset labels are present in the stored string. */
export function parseFurnitureSet(furnishing: string): Set<string> {
  const normalized = furnishing
    .replace(/\b(and|&)\b/gi, ",")
    .split(/[\n,]+/)
    .map((s) => s.trim().replace(/^(and|&)\s+/i, ""))
    .filter(Boolean);
  const lower = new Set(normalized.map((l) => l.toLowerCase()));
  const out = new Set<string>();
  for (const p of ROOM_FURNITURE_PRESETS) {
    if (lower.has(p.label.toLowerCase())) out.add(p.label);
  }
  return out;
}

type FurnishingSelectValue = (typeof ROOM_FURNISHING_OPTIONS)[number]["value"];

/** For select: known preset, custom text, or empty */
export function furnishingSelectState(furnishing: string): { select: FurnishingSelectValue; custom: string } {
  const raw = typeof furnishing === "string" ? furnishing : "";
  if (raw.length === 0) return { select: "", custom: "" };
  const t = raw.trim();
  if (FURNISHING_KNOWN.has(t)) return { select: t as FurnishingSelectValue, custom: "" };
  return { select: "", custom: "" };
}

/** Airbnb-style “create listing” basics — property type tiles + dropdown-friendly ids. */
export const LISTING_PROPERTY_TYPE_OPTIONS = [
  { id: "house", label: "House", hint: "Detached or standalone home" },
  { id: "townhouse", label: "Townhouse", hint: "Row or attached home" },
  { id: "apartment", label: "Apartment", hint: "Flat in a building" },
  { id: "condo", label: "Condo", hint: "Owned unit in a building" },
  { id: "duplex", label: "Duplex / triplex", hint: "Small multi-unit building" },
  { id: "other", label: "Other", hint: "Describe in overview" },
] as const;

export const LISTING_PLACE_CATEGORY_OPTIONS = [
  {
    id: "shared_home",
    label: "Shared home — rent by bedroom",
    short: "Shared home",
    hint: "Roommates / coliving — each room listed separately",
  },
  {
    id: "entire_home",
    label: "Entire place — one lease for the home",
    short: "Entire home",
    hint: "Rent the full unit; you can still itemize rooms inside Axis",
  },
] as const;

export const LISTING_STORIES_OPTIONS = [
  { id: "1", label: "Single level (1 floor)" },
  { id: "2", label: "2 floors" },
  { id: "3", label: "3 floors" },
  { id: "4", label: "4+ floors" },
  { id: "split", label: "Split level" },
] as const;

export const LISTING_TOTAL_BATH_OPTIONS = [
  { id: "1", label: "1 bathroom" },
  { id: "1.5", label: "1.5 bathrooms" },
  { id: "2", label: "2 bathrooms" },
  { id: "2.5", label: "2.5 bathrooms" },
  { id: "3", label: "3 bathrooms" },
  { id: "3.5", label: "3.5 bathrooms" },
  { id: "4", label: "4 bathrooms" },
  { id: "4+", label: "4+ bathrooms" },
] as const;

export const LISTING_BEDROOM_SLOT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] as const;

/** Sentinel for room floor `<select>` when value is custom text. */
export const ROOM_FLOOR_LEVEL_CUSTOM = "__floor_custom__";

export const LISTING_ROOM_FLOOR_LEVEL_OPTIONS = [
  { id: "basement", label: "Basement / garden level" },
  { id: "main", label: "1st / main floor" },
  { id: "2", label: "2nd floor" },
  { id: "3", label: "3rd floor" },
  { id: "4+", label: "4th floor or higher" },
  { id: "loft", label: "Loft / attic" },
] as const;
