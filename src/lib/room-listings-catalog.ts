import { getListingRichContent } from "@/data/listing-rich-content";
import type { ListingRoomRow } from "@/data/listing-rich-content";
import type { MockProperty } from "@/data/types";
import {
  parseMonthlyRent,
  parseUSZip,
  propertyMatchesZipRadius,
} from "@/lib/listings-search";

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
};

function streetUpperFromProperty(p: MockProperty): string {
  const first = p.address.split(",")[0]?.trim() ?? p.address;
  return first.toUpperCase();
}

function headlineAddressFromProperty(p: MockProperty): string {
  return p.address.split(",")[0]?.trim() ?? p.address;
}

function descriptionBlurb(p: MockProperty, room: ListingRoomRow): string {
  const detail = room.detail.replace(/\s+/g, " ").trim();
  const extra = detail.length > 80 ? `${detail.slice(0, 80)}…` : detail;
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
  const a = room.availability.toLowerCase();
  if (a.includes("available")) return "1 available";
  return room.availability;
}

function bathroomHintFromRoom(room: ListingRoomRow): string {
  const blob = `${room.detail} ${room.modal.setupLine}`.toLowerCase();
  if (/\ben[- ]?suite\b|private bath|private\b/.test(blob)) return "Private bath";
  if (/\bshared\b.*\bbath\b|\bshares bathroom\b/.test(blob)) {
    const m = blob.match(/(\d+)[- ]?person/);
    if (m) return `${m[1]}-person shared bath`;
    return "Shared bath";
  }
  if (blob.includes("hall")) return "Hall bath";
  return "Bath setup on listing";
}

export function roomMatchesBathroomFilter(room: ListingRoomRow, bathroomId: string): boolean {
  if (bathroomId === "any") return true;
  const blob = [room.detail, room.modal.setupLine, ...room.modal.includedTags].join(" ").toLowerCase();
  if (bathroomId === "private") {
    return /\bprivate\b|en[- ]?suite|private bath/.test(blob);
  }
  if (bathroomId === "2-share") {
    return /2[- ]?person|two[- ]?person|2[- ]?share|shared with 1\b/.test(blob);
  }
  if (bathroomId === "3-share") {
    return /3[- ]?person|three[- ]?person|3[- ]?share|shared with 2\b/.test(blob);
  }
  if (bathroomId === "4-share") {
    return /4[- ]?person|four[- ]?person|4[- ]?share|shared with 3\b/.test(blob);
  }
  return true;
}

export function filterRoomListings(
  properties: MockProperty[],
  opts: {
    zipRaw: string;
    radiusMiles: number;
    maxBudgetNum: number | null;
    bathroom: string;
  },
): RoomListingRow[] {
  const centerZip = parseUSZip(opts.zipRaw);
  const rows: RoomListingRow[] = [];

  for (const p of properties) {
    const rich = getListingRichContent(p);
    const geoOk = centerZip === null ? true : propertyMatchesZipRadius(p.zip, opts.zipRaw, opts.radiusMiles);
    if (!geoOk) continue;

    for (const floor of rich.floorPlans) {
      for (const room of floor.rooms) {
        if (!roomMatchesBathroomFilter(room, opts.bathroom)) continue;
        const rentNumeric = parseMonthlyRent(room.price.replace("/month", "/ mo"));
        const budgetOk =
          opts.maxBudgetNum === null || !Number.isFinite(opts.maxBudgetNum) || rentNumeric === null
            ? true
            : rentNumeric <= opts.maxBudgetNum;
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
        });
      }
    }
  }
  return rows;
}
