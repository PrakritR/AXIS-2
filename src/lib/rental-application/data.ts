import { mockProperties } from "@/data/mock-properties";
import type { ListingRichContent } from "@/data/listing-rich-content";
import type { MockProperty } from "@/data/types";
import { readAllExtraListings, readExtraListings } from "@/lib/demo-property-pipeline";
import { effectiveApplicationForRow, readManagerApplicationRows } from "@/lib/manager-applications-storage";
import { normalizeManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";

export const LEASE_TERM_OPTIONS = ["3-Month", "9-Month", "12-Month", "Month-to-Month", "Custom"] as const;
export const SHORT_TERM_LEASE_TERM = "Short-Term Stay";

export type LeaseTermOption = (typeof LEASE_TERM_OPTIONS)[number];

/** Separates listing property id from submission room id in `roomChoice*` values. */
export const LISTING_ROOM_CHOICE_SEP = "::";

export type ParsedRoomChoice = { propertyId: string; listingRoomId?: string };
type RoomAvailabilityOptions = {
  leaseStart?: string | null;
  leaseEnd?: string | null;
  excludeApplicationId?: string | null;
};

export function parseRoomChoiceValue(value: string): ParsedRoomChoice {
  const v = value.trim();
  if (!v) return { propertyId: "" };
  const i = v.indexOf(LISTING_ROOM_CHOICE_SEP);
  if (i === -1) return { propertyId: v };
  return { propertyId: v.slice(0, i), listingRoomId: v.slice(i + LISTING_ROOM_CHOICE_SEP.length) };
}

function parseFlexibleLocalDate(value: string | undefined | null): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(dt.getTime()) ? null : new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
    const [m, d, y] = raw.split("/").map(Number);
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(dt.getTime()) ? null : new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  }
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function dateMinusOneDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
}

function formatAvailabilityDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function intervalsOverlap(
  startA: Date | null,
  endA: Date | null,
  startB: Date | null,
  endB: Date | null,
): boolean {
  if (!startA || !startB) return true;
  const aStart = startA.getTime();
  const aEnd = endA ? endA.getTime() : Number.POSITIVE_INFINITY;
  const bStart = startB.getTime();
  const bEnd = endB ? endB.getTime() : Number.POSITIVE_INFINITY;
  return aStart <= bEnd && bStart <= aEnd;
}

function manualUnavailableRangesForRoomChoice(roomChoiceValue: string) {
  const parsed = parseRoomChoiceValue(roomChoiceValue);
  if (!parsed.listingRoomId || !parsed.propertyId) return [];
  const prop = getPropertyById(parsed.propertyId);
  if (!prop?.listingSubmission || prop.listingSubmission.v !== 1) return [];
  const sub = normalizeManagerListingSubmissionV1(prop.listingSubmission);
  const room = sub.rooms.find((r) => r.id === parsed.listingRoomId);
  return room?.manualUnavailableRanges ?? [];
}

/** True if proposed lease [targetStart, targetEnd] overlaps any manager-defined block (inclusive). */
function leaseBlockedByManualRanges(roomChoiceValue: string, targetStart: Date, targetEnd: Date | null): boolean {
  for (const range of manualUnavailableRangesForRoomChoice(roomChoiceValue)) {
    const bs = parseFlexibleLocalDate(range.start);
    const be = parseFlexibleLocalDate(range.end);
    if (!bs || !be) continue;
    if (be.getTime() < bs.getTime()) continue;
    if (intervalsOverlap(targetStart, targetEnd, bs, be)) return true;
  }
  return false;
}

function availabilityTextAllowsDate(rawAvailability: string, targetDate: Date): boolean {
  const raw = rawAvailability.trim();
  if (!raw) return true;
  const lower = raw.toLowerCase();

  if (/\bunavailable\b|not available|signed.*not available|no longer available|not open\b/.test(lower)) {
    return false;
  }
  if (/\bavailable now\b/.test(lower) || /^available\s*$/i.test(raw)) {
    return true;
  }

  const rangeMatches = [...raw.matchAll(/([A-Za-z]+\s+\d{1,2},\s+\d{4})\s*[-–]\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/g)];
  for (const match of rangeMatches) {
    const start = parseFlexibleLocalDate(match[1]);
    const end = parseFlexibleLocalDate(match[2]);
    if (start && end && intervalsOverlap(targetDate, targetDate, start, end)) {
      return true;
    }
  }

  const afterMatches = [...raw.matchAll(/available\s+after\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/gi)];
  for (const match of afterMatches) {
    const after = parseFlexibleLocalDate(match[1]);
    if (after && targetDate.getTime() >= after.getTime()) {
      return true;
    }
  }

  if (/\bwaitlist\b|\bavailable soon\b/i.test(raw)) return false;
  if (lower.includes("available") && !lower.includes("after")) return true;
  return rangeMatches.length === 0 && afterMatches.length === 0;
}

type ApprovedRoomOccupancy = {
  rowId: string;
  leaseStart: Date | null;
  leaseEnd: Date | null;
};

function approvedOccupancyForRoom(roomChoiceValue: string, excludeApplicationId?: string | null): ApprovedRoomOccupancy[] {
  const parsedTarget = parseRoomChoiceValue(roomChoiceValue);
  const normalizedTarget = roomChoiceValue.trim();
  return readManagerApplicationRows()
    .filter((row) => row.bucket === "approved" && row.id !== excludeApplicationId)
    .map((row) => {
      const effective = effectiveApplicationForRow(row);
      const assignedChoice = row.assignedRoomChoice?.trim() || effective?.roomChoice1?.trim() || "";
      if (!assignedChoice) return null;
      const parsedAssigned = parseRoomChoiceValue(assignedChoice);
      const sameRoom =
        assignedChoice === normalizedTarget ||
        (parsedAssigned.propertyId === parsedTarget.propertyId &&
          String(parsedAssigned.listingRoomId ?? "") === String(parsedTarget.listingRoomId ?? ""));
      if (!sameRoom) return null;
      return {
        rowId: row.id,
        leaseStart: parseFlexibleLocalDate(effective?.leaseStart),
        leaseEnd: parseFlexibleLocalDate(effective?.leaseEnd),
      };
    })
    .filter((value): value is ApprovedRoomOccupancy => Boolean(value));
}

export function isRoomChoiceAvailable(
  roomChoiceValue: string,
  rawAvailability: string,
  options: RoomAvailabilityOptions = {},
): boolean {
  const targetStart = parseFlexibleLocalDate(options.leaseStart) ?? startOfToday();
  const targetEnd = parseFlexibleLocalDate(options.leaseEnd);
  if (!availabilityTextAllowsDate(rawAvailability, targetStart)) return false;
  const occupancies = approvedOccupancyForRoom(roomChoiceValue, options.excludeApplicationId);
  if (occupancies.some((occ) => intervalsOverlap(targetStart, targetEnd, occ.leaseStart, occ.leaseEnd))) {
    return false;
  }
  if (leaseBlockedByManualRanges(roomChoiceValue, targetStart, targetEnd)) {
    return false;
  }
  return true;
}

export function effectiveRoomAvailabilityLabel(
  roomChoiceValue: string,
  rawAvailability: string,
  options: RoomAvailabilityOptions = {},
): string {
  const targetStart = parseFlexibleLocalDate(options.leaseStart) ?? startOfToday();
  if (!availabilityTextAllowsDate(rawAvailability, targetStart)) return rawAvailability;
  const occupancies = approvedOccupancyForRoom(roomChoiceValue, options.excludeApplicationId);
  const blocking = occupancies.find((occ) => intervalsOverlap(targetStart, parseFlexibleLocalDate(options.leaseEnd), occ.leaseStart, occ.leaseEnd));
  if (!blocking) return rawAvailability;
  if (blocking.leaseStart && blocking.leaseStart.getTime() > targetStart.getTime()) {
    return `Available until ${formatAvailabilityDate(dateMinusOneDay(blocking.leaseStart))}`;
  }
  return "Unavailable";
}

/** Human-readable label for a 1st/2nd/3rd room choice (legacy property id or `mgr-*::roomId`). */
export function getRoomChoiceLabel(roomChoiceValue: string): string {
  const t = roomChoiceValue.trim();
  if (!t) return "";
  const { propertyId, listingRoomId } = parseRoomChoiceValue(t);
  if (listingRoomId) {
    const prop = getPropertyById(propertyId);
    if (!prop?.listingSubmission || prop.listingSubmission.v !== 1) return prop?.title ?? "";
    const sub = normalizeManagerListingSubmissionV1(prop.listingSubmission);
    const room = sub.rooms.find((r) => r.id === listingRoomId);
    if (!room) return prop.title;
    const rent = room.monthlyRent > 0 ? `$${room.monthlyRent}/mo` : "";
    const parts = [room.name.trim(), room.floor.trim(), rent].filter(Boolean);
    return parts.length ? parts.join(" · ") : room.name.trim();
  }
  const r = getPropertyById(t);
  return r ? `${r.buildingName} · ${r.unitLabel}` : "";
}

/** Dropdown: one row per listing (property + unit). */
export function getPropertySelectOptions(): { value: string; label: string }[] {
  return mockProperties.map((p) => ({
    value: p.id,
    label: p.title,
  }));
}

export function getPropertyById(id: string): MockProperty | undefined {
  const base = id.trim();
  if (!base) return undefined;
  const { propertyId } = parseRoomChoiceValue(base);
  return (
    mockProperties.find((p) => p.id === propertyId) ??
    readExtraListings().find((p) => p.id === propertyId) ??
    readAllExtraListings().find((p) => p.id === propertyId)
  );
}

export function propertyAllowsShortTermRental(propertyId: string): boolean {
  const property = getPropertyById(propertyId);
  return Boolean(property?.listingSubmission?.shortTermRentalsAllowed);
}

/** Rooms for the selected listing: manager submission rooms, else legacy one-row-per-unit in the same building. */
export function getRoomOptionsForProperty(propertyId: string, options: RoomAvailabilityOptions = {}): { value: string; label: string }[] {
  const selected = getPropertyById(propertyId);
  if (!selected) return [];

  if (selected.listingSubmission?.v === 1) {
    const sub = normalizeManagerListingSubmissionV1(selected.listingSubmission);
    const roomRows = sub.rooms.filter((r) => r.name.trim());
    if (roomRows.length > 0) {
      return roomRows
        .filter((r) =>
          isRoomChoiceAvailable(`${selected.id}${LISTING_ROOM_CHOICE_SEP}${r.id}`, r.availability, options),
        )
        .map((r) => {
        const rent = r.monthlyRent > 0 ? `$${r.monthlyRent}/mo` : "Rent TBD";
        const floor = r.floor.trim();
        const label = [r.name.trim(), floor, rent].filter(Boolean).join(" · ");
        return { value: `${selected.id}${LISTING_ROOM_CHOICE_SEP}${r.id}`, label };
        });
    }
  }

  const catalog = [...mockProperties, ...readAllExtraListings(), ...readExtraListings()];
  const seen = new Set<string>();
  const out: { value: string; label: string }[] = [];
  for (const p of catalog) {
    if (p.buildingId !== selected.buildingId) continue;
    if (seen.has(p.id)) continue;
    if (!isRoomChoiceAvailable(p.id, p.available, options)) continue;
    seen.add(p.id);
    out.push({
      value: p.id,
      label: p.unitLabel ? `${p.buildingName} · ${p.unitLabel}` : p.title,
    });
  }
  return out;
}

const NONE = "";

export function roomSelectOptionsWithNone(propertyId: string, options: RoomAvailabilityOptions = {}): { value: string; label: string }[] {
  return [{ value: NONE, label: "None" }, ...getRoomOptionsForProperty(propertyId, options)];
}

export function getDemoRoomAvailabilityMessage(
  roomId: string,
  leaseStart: string,
  leaseEnd: string | undefined,
  leaseTerm: string,
): string | null {
  if (!roomId || !leaseStart) return null;
  const mtm = leaseTerm === "Month-to-Month";
  const endForCheck = mtm ? undefined : leaseEnd?.trim() || undefined;
  const { propertyId, listingRoomId } = parseRoomChoiceValue(roomId);
  const room = getPropertyById(listingRoomId ? propertyId : roomId);
  if (!room) return null;
  const rawAvailability =
    listingRoomId && room.listingSubmission?.v === 1
      ? normalizeManagerListingSubmissionV1(room.listingSubmission).rooms.find((r) => r.id === listingRoomId)?.availability ?? "Unavailable"
      : room.available;
  return isRoomChoiceAvailable(roomId, rawAvailability, { leaseStart, leaseEnd: endForCheck })
    ? null
    : "This room is not available for the selected lease dates. Choose another room or adjust your dates.";
}

export function applyApprovedAvailabilityToRichContent(property: MockProperty, rich: ListingRichContent): ListingRichContent {
  return {
    ...rich,
    floorPlans: rich.floorPlans.map((floor) => ({
      ...floor,
      rooms: floor.rooms.map((room) => {
        const roomChoiceValue = `${property.id}${LISTING_ROOM_CHOICE_SEP}${room.id}`;
        return {
          ...room,
          availability: effectiveRoomAvailabilityLabel(roomChoiceValue, room.availability),
        };
      }),
    })),
  };
}
