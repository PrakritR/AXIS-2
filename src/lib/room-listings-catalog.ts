import { getListingRichContent } from "@/data/listing-rich-content";
import type { ListingRoomRow } from "@/data/listing-rich-content";
import type { MockProperty } from "@/data/types";
import {
  parseMonthlyRent,
  parseUSZip,
  propertyMatchesZipRadius,
} from "@/lib/listings-search";
import { isRoomChoiceAvailable, LISTING_ROOM_CHOICE_SEP } from "@/lib/rental-application/data";

export type RoomListingRow = {
  key: string;
  propertyId: string;
  roomId: string;
  roomName: string;
  floorLabel: string;
  /** e.g. "First Floor — Room 1" */
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
  descriptionBlurb: string;
  listingTags: readonly string[];
  /** Shown on image overlay, e.g. "$775" or "$750–$875" */
  priceOverlayLabel: string;
  /** Raw listing availability string (for traffic-light styling on search cards). */
  availabilityRaw: string;
  /** Room photos only (no house-level fallback on room cards). */
  photoUrls: string[];
  /** Uploaded room videos for this room listing. */
  videoUrls: string[];
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

function formatRoomTitle(floorLabel: string, roomName: string): string {
  const floor = floorLabel.replace(/\b\w/g, (ch) => ch.toUpperCase());
  return `${floor} — ${roomName}`;
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

export function filterRoomListings(
  properties: MockProperty[],
  opts: {
    zipRaw: string;
    radiusMiles: number;
    maxBudgetNum: number | null;
    bathroom: string;
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
    const geoOk = centerZip === null ? true : propertyMatchesZipRadius(p.zip, opts.zipRaw, opts.radiusMiles);
    if (!geoOk) continue;

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
          title: formatRoomTitle(floor.floorLabel, room.name),
          streetUpper: streetUpperFromProperty(p),
          neighborhood: p.neighborhood,
          priceLabel: room.price.includes("/mo") ? room.price : room.price.replace("/month", "/month"),
          rentNumeric,
          availabilityLabel: availabilityLabel(room),
          bathroomHint: bathroomHintFromRoom(room),
          zip: p.zip,
          headlineAddress: headlineAddressFromProperty(p),
          fullAddress: p.address,
          propertyBeds: p.beds,
          propertyBaths: p.baths,
          descriptionBlurb: descriptionBlurb(p, room),
          listingTags: listingTags(p),
          priceOverlayLabel: priceOverlayLabelForProperty(p),
          availabilityRaw: room.availability,
          photoUrls: room.modal.photoUrls?.length ? room.modal.photoUrls : [],
          videoUrls: room.modal.videoSrc ? [room.modal.videoSrc] : [],
        });
      }
    }
  }
  return rows;
}
