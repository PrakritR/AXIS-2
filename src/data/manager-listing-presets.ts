/** Preset labels stored as lines in `amenitiesText` / `roomAmenitiesText` (toggle sync in form). */

export const LISTING_AMENITY_PRESETS = [
  { id: "wifi", label: "WiFi" },
  { id: "in-unit-laundry", label: "In-unit laundry" },
  { id: "in-building-laundry", label: "In-building laundry" },
  { id: "heating", label: "Heating" },
  { id: "ac", label: "Air conditioning" },
  { id: "dishwasher", label: "Dishwasher" },
  { id: "microwave", label: "Microwave" },
  { id: "oven-range", label: "Oven / range" },
  { id: "fridge", label: "Refrigerator" },
  { id: "desk", label: "Desk" },
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

export const ROOM_AVAILABILITY_OPTIONS = [
  "Available now",
  "Available soon",
  "Waitlist",
  "Signed — not available",
] as const;

export const ROOM_FURNISHING_OPTIONS = [
  { value: "", label: "Select…" },
  { value: "Unfurnished", label: "Unfurnished" },
  { value: "Partially furnished", label: "Partially furnished" },
  { value: "Fully furnished", label: "Fully furnished" },
  { value: "__custom__", label: "Custom (describe below)" },
] as const;

/** Known single-value furnishing presets (not "" or __custom__). */
const FURNISHING_KNOWN: Set<string> = new Set(
  ROOM_FURNISHING_OPTIONS.map((o) => o.value).filter((v) => Boolean(v) && v !== "__custom__") as string[],
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
  /** Whitespace-only keeps "custom" selected (preset → Custom with no typed text yet uses a space draft). */
  if (t.length === 0) return { select: "__custom__", custom: "" };
  return { select: "__custom__", custom: t };
}
