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
  { id: "dishwasher", label: "Dishwasher" },
  { id: "microwave", label: "Microwave" },
  { id: "oven-range", label: "Oven / range" },
  { id: "fridge", label: "Refrigerator" },
  { id: "desk", label: "Desk / workspace" },
  { id: "tv-common", label: "TV in common area" },
  { id: "lounge-seating", label: "Living / lounge seating" },
  { id: "printer", label: "Shared printer" },
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

type FurnishingSelectValue = (typeof ROOM_FURNISHING_OPTIONS)[number]["value"];

/** For select: known preset, custom text, or empty */
export function furnishingSelectState(furnishing: string): { select: FurnishingSelectValue; custom: string } {
  const raw = typeof furnishing === "string" ? furnishing : "";
  if (raw.length === 0) return { select: "", custom: "" };
  const t = raw.trim();
  if (FURNISHING_KNOWN.has(t)) return { select: t as FurnishingSelectValue, custom: "" };
  return { select: "", custom: "" };
}
