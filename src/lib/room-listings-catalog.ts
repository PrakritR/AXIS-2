import { getListingRichContent } from "@/data/listing-rich-content";
import type { ListingRoomRow } from "@/data/listing-rich-content";
import type { MockProperty } from "@/data/types";
import {
  parseMonthlyRent,
  parseUSZip,
  propertyMatchesZipRadius,
} from "@/lib/listings-search";
import { isRoomChoiceAvailable, LISTING_ROOM_CHOICE_SEP } from "@/lib/rental-application/data";

export type RoomListingSlide = {
  roomName: string;
  kind: "photo" | "video";
  src: string;
};

export type RoomListingRow = {
  key: string;
  propertyId: string;
  roomId: string;
  roomName: string;
  floorLabel: string;
  /** e.g. "Second Floor bedroom · University District" */
  title: string;
  /** Short street line, uppercased like marketing cards */
  streetUpper: string;
  neighborhood: string;
  priceLabel: string;
  rentNumeric: number | null;
  availabilityLabel: string;
  bathroomHint: string;
  zip: string;
  /** Bold title line (street / building line) */
  headlineAddress: string;
  fullAddress: string;
  propertyBeds: number;
  propertyBaths: number;
  petFriendly: boolean;
  descriptionBlurb: string;
  listingTags: readonly string[];
  /** Shown on image overlay, e.g. "$775" or "$750–$875" */
  priceOverlayLabel: string;
  /** Raw listing availability string (for traffic-light styling on search cards). */
  availabilityRaw: string;
  /** Property-wide room media for search card carousel (Room 1, Room 2, … when uploaded). */
  mediaSlides: RoomListingSlide[];
};

function streetUpperFromProperty(p: MockProperty): string {
  const first = p.address.split(",")[0]?.trim() ?? p.address;
  return first.toUpperCase();
}

function headlineAddressFromProperty(p: MockProperty): string {
  return p.address.split(",")[0]?.trim() ?? p.address;
}

function descriptionBlurb(p: MockProperty, room: ListingRoomRow): string {
  const notes = (room.modal.roomNotes ?? room.detail).replace(/\s+/g, " ").trim();
  const extra = notes.length > 80 ? `${notes.slice(0, 80)}…` : notes;
  if (p.tagline && extra) return `${p.tagline} ${extra}`;
  return p.tagline || extra || "Seattle shared home with furnished rooms and common areas.";
}

function listingTags(p: MockProperty): readonly string[] {
  return ["Room rental", p.neighborhood, "Shared living"] as const;
}

function priceOverlayLabelForProperty(p: MockProperty): string {
  const rich = getListingRichContent(p);
  const nums: number[] = [];
  for (const f of rich.floorPlans) {
    for (const r of f.rooms) {
      const n = parseMonthlyRent(r.price.replace("/month", "/ mo"));
      if (n !== null) nums.push(n);
    }
  }
  if (nums.length === 0) return "—";
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (min === max) return `$${min.toLocaleString("en-US")}`;
  return `$${min.toLocaleString("en-US")}–$${max.toLocaleString("en-US")}`;
}

function titleCaseWords(s: string): string {
  return s.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** Strip manager bathroom grouping labels like "Bathroom 3 · Second Floor". */
function humanizeFloorLabel(raw: string): string {
  const t = raw.trim();
  if (!t || /other bedrooms|not specified|floor plan/i.test(t)) return "";

  if (t.includes("·")) {
    const parts = t.split("·").map((p) => p.trim()).filter(Boolean);
    const floorPart = parts.find((p) => /floor|level|basement|ground|main|upper|lower|story|stories/i.test(p));
    if (floorPart) return titleCaseWords(floorPart);
    const nonBath = parts.find((p) => !/^bathroom\b/i.test(p));
    if (nonBath) return titleCaseWords(nonBath);
    return "";
  }

  if (/^bathroom\b/i.test(t)) return "";
  return titleCaseWords(t);
}

/** Short, renter-friendly line under the room name on search cards. */
export function formatRoomListingSubtitle(opts: {
  floorLabel: string;
  room: ListingRoomRow;
  neighborhood: string;
}): string {
  const floorFromRoom = opts.room.modal.floorLine?.trim();
  const floor = floorFromRoom ? titleCaseWords(floorFromRoom) : humanizeFloorLabel(opts.floorLabel);
  const neighborhood = opts.neighborhood.trim();

  let lead: string;
  if (floor) {
    lead = /floor|level|basement|ground|story|stories/i.test(floor)
      ? `${floor} bedroom`
      : `${floor} room`;
  } else {
    lead = "Private bedroom";
  }

  if (neighborhood) return `${lead} · ${neighborhood}`;
  return lead;
}

function availabilityLabel(room: ListingRoomRow): string {
  const raw = room.availability.trim();
  const a = raw.toLowerCase();
  if (/\bunavailable\b|not available|no longer available/i.test(a)) return raw;
  if (/available\s+after/i.test(raw)) return raw;
  if (/\bwaitlist\b|available soon\b/i.test(a)) return raw;
  if (a.includes("available")) return "1 available";
  return raw;
}

function bathroomHintFromRoom(room: ListingRoomRow): string {
  const blob = `${room.modal.roomNotes ?? room.detail} ${room.modal.setupLine} ${(room.modal.roomAmenityLabels ?? []).join(" ")}`.toLowerCase();
  const n = room.bathroomShareCount;
  if (typeof n === "number" && n === 1) return "Private bath";
  if (typeof n === "number" && n >= 2) return `${n}-person shared bath`;
  if (/\ben[- ]?suite\b|private bath|private\b/.test(blob)) return "Private bath";
  if (/\bshared\b.*\bbath\b|\bshares bathroom\b/.test(blob)) {
    const m = blob.match(/(\d+)[- ]?person/);
    if (m) return `${m[1]}-person shared bath`;
    return "Shared bath";
  }
  if (blob.includes("hall")) return "Hall bath";
  return "Bath setup on listing";
}

function roomSearchTextBlob(room: ListingRoomRow): string {
  return [
    room.modal.roomNotes ?? room.detail,
    room.modal.setupLine,
    ...room.modal.includedTags,
    ...(room.modal.roomAmenityLabels ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

function roomMatchesBathroomFilterHeuristic(room: ListingRoomRow, bathroomId: string): boolean {
  const blob = roomSearchTextBlob(room);
  if (bathroomId === "private") {
    return /\bprivate\b|en[- ]?suite|en suite\b|private bath/.test(blob);
  }
  // Avoid `\d[- ]?share` — it matches "2 shared" (floor 2 + shared bath).
  if (bathroomId === "2-share") {
    return (
      /\b(?:2|two)[\s\-–]+(?:person|people|resident|roommates)\b/i.test(blob) ||
      /\bshared with\s+(?:one|1)(?:\s+other)?\s+(?:person|people|resident|roommate)s?\b/i.test(blob) ||
      /\b1\s+other\s+(?:person|people|resident|roommate)\b/i.test(blob)
    );
  }
  if (bathroomId === "3-share") {
    return (
      /\b(?:3|three)[\s\-–]+(?:person|people|resident|roommates)\b/i.test(blob) ||
      /\bshared with\s+(?:2|two)(?:\s+other)?\s+(?:person|people|resident|roommate)s?\b/i.test(blob)
    );
  }
  if (bathroomId === "4-share") {
    return (
      /\b(?:4|four)[\s\-–]+(?:person|people|resident|roommates)\b/i.test(blob) ||
      /\bshared with\s+(?:3|three)(?:\s+other)?\s+(?:person|people|resident|roommate)s?\b/i.test(blob)
    );
  }
  return true;
}

/** "any" | "studio" | "1" | "2" | "3" (3 means 3+). */
export function roomMatchesBedroomFilter(propertyBeds: number, bedroomId: string | undefined): boolean {
  if (!bedroomId || bedroomId === "any") return true;
  if (bedroomId === "studio") return propertyBeds === 0;
  if (bedroomId === "3") return propertyBeds >= 3;
  const n = Number.parseInt(bedroomId, 10);
  return Number.isFinite(n) ? propertyBeds === n : true;
}

export function roomMatchesBathroomFilter(room: ListingRoomRow, bathroomId: string): boolean {
  if (bathroomId === "any") return true;

  const n = room.bathroomShareCount;
  if (typeof n === "number" && Number.isFinite(n) && n > 0) {
    if (bathroomId === "private") return n === 1;
    if (bathroomId === "2-share") return n === 2;
    if (bathroomId === "3-share") return n === 3;
    if (bathroomId === "4-share") return n === 4;
    return false;
  }

  return roomMatchesBathroomFilterHeuristic(room, bathroomId);
}

/** Collect room photos/videos across the listing for search-card sliders (Room 1, Room 2, …). */
export function collectPropertyMediaSlides(rich: ReturnType<typeof getListingRichContent>): RoomListingSlide[] {
  const slides: RoomListingSlide[] = [];
  for (const floor of rich.floorPlans) {
    for (const room of floor.rooms) {
      const videoSrc = room.modal.videoSrc?.trim();
      if (videoSrc) slides.push({ roomName: room.name, kind: "video", src: videoSrc });
      for (const url of room.modal.photoUrls ?? []) {
        const src = url.trim();
        if (src) slides.push({ roomName: room.name, kind: "photo", src });
      }
    }
  }
  if (slides.length === 0) {
    for (const url of rich.heroHousePhotoUrls ?? []) {
      const src = url.trim();
      if (src) slides.push({ roomName: "House", kind: "photo", src });
    }
  }
  return slides.slice(0, 12);
}

export function filterRoomListings(
  properties: MockProperty[],
  opts: {
    zipRaw: string;
    radiusMiles: number;
    maxBudgetNum: number | null;
    bathroom: string;
    bedroom?: string;
    petFriendly?: boolean;
    neighborhood?: string;
    moveIn?: string;
    moveOut?: string;
  },
): RoomListingRow[] {
  const centerZip = parseUSZip(opts.zipRaw);

  // When browsing with no dates, check [today, far future] so rooms with any
  // upcoming approved occupancy are hidden, not just ones occupied right now.
  const noDates = !opts.moveIn?.trim() && !opts.moveOut?.trim();
  const todayForOcc = (() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  })();
  const farFutureForOcc = `${new Date().getFullYear() + 5}-12-31`;

  const rows: RoomListingRow[] = [];

  for (const p of properties) {
    const rich = getListingRichContent(p);
    const mediaSlides = collectPropertyMediaSlides(rich);
    const geoOk = centerZip === null ? true : propertyMatchesZipRadius(p.zip, opts.zipRaw, opts.radiusMiles);
    if (!geoOk) continue;
    if (!roomMatchesBedroomFilter(p.beds, opts.bedroom)) continue;
    if (opts.petFriendly && !p.petFriendly) continue;
    if (
      opts.neighborhood &&
      opts.neighborhood !== "any" &&
      p.neighborhood.trim().toLowerCase() !== opts.neighborhood.trim().toLowerCase()
    ) {
      continue;
    }

    for (const floor of rich.floorPlans) {
      for (const room of floor.rooms) {
        if (
          !isRoomChoiceAvailable(`${p.id}${LISTING_ROOM_CHOICE_SEP}${room.id}`, room.availability, {
            leaseStart: noDates ? todayForOcc : opts.moveIn,
            leaseEnd: noDates ? farFutureForOcc : opts.moveOut,
          })
        ) {
          continue;
        }
        if (!roomMatchesBathroomFilter(room, opts.bathroom)) continue;
        const rentNumeric = parseMonthlyRent(room.price.replace("/month", "/ mo"));
        const budgetOk =
          opts.maxBudgetNum === null || !Number.isFinite(opts.maxBudgetNum)
            ? true
            : rentNumeric !== null && rentNumeric <= opts.maxBudgetNum;
        if (!budgetOk) continue;

        rows.push({
          key: `${p.id}:${room.id}`,
          propertyId: p.id,
          roomId: room.id,
          roomName: room.name,
          floorLabel: floor.floorLabel,
          title: formatRoomListingSubtitle({ floorLabel: floor.floorLabel, room, neighborhood: p.neighborhood }),
          streetUpper: streetUpperFromProperty(p),
          neighborhood: p.neighborhood,
          priceLabel: room.price,
          rentNumeric,
          availabilityLabel: availabilityLabel(room),
          bathroomHint: bathroomHintFromRoom(room),
          zip: p.zip,
          headlineAddress: headlineAddressFromProperty(p),
          fullAddress: p.address,
          propertyBeds: p.beds,
          propertyBaths: p.baths,
          petFriendly: p.petFriendly,
          descriptionBlurb: descriptionBlurb(p, room),
          listingTags: listingTags(p),
          priceOverlayLabel: priceOverlayLabelForProperty(p),
          availabilityRaw: room.availability,
          mediaSlides,
        });
      }
    }
  }
  return rows;
}
