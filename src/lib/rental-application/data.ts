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

function datePlusOneDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
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

type ApprovedRoomOccupancy = {
  rowId: string;
  leaseStart: Date;
  leaseEnd: Date | null;
};

export type RoomUnavailabilityWindow = {
  id: string;
  start: Date | null;
  end: Date | null;
  label: string;
  source: "resident" | "manual_block";
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

      const manualStart = parseFlexibleLocalDate(row.manualResidentDetails?.moveInDate);
      const manualEnd = parseFlexibleLocalDate(row.manualResidentDetails?.moveOutDate);
      const appStart = parseFlexibleLocalDate(effective?.leaseStart);
      const appEnd = parseFlexibleLocalDate(effective?.leaseEnd);
      const leaseStart = manualStart ?? appStart;
      const leaseEnd = manualEnd ?? appEnd;

      // Reliable occupancy requires a known move-in/start date.
      if (!leaseStart) return null;

      return {
        rowId: row.id,
        leaseStart,
        leaseEnd,
      };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);
}

export function getRoomUnavailabilityWindows(
  roomChoiceValue: string,
  options: Pick<RoomAvailabilityOptions, "excludeApplicationId"> = {},
): RoomUnavailabilityWindow[] {
  const residentWindows = approvedOccupancyForRoom(roomChoiceValue, options.excludeApplicationId)
    .map((occ) => {
      const hasRange = Boolean(occ.leaseStart || occ.leaseEnd);
      if (!hasRange) return null;
      const label = occ.leaseStart && occ.leaseEnd
        ? `Occupied ${formatAvailabilityDate(occ.leaseStart)} to ${formatAvailabilityDate(occ.leaseEnd)}`
        : occ.leaseStart
          ? `Occupied from ${formatAvailabilityDate(occ.leaseStart)}`
          : `Occupied until ${formatAvailabilityDate(occ.leaseEnd as Date)}`;
      return {
        id: `resident-${occ.rowId}`,
        start: occ.leaseStart,
        end: occ.leaseEnd,
        label,
        source: "resident" as const,
      };
    })
    .filter((w) => w !== null);

  const manualWindows = manualUnavailableRangesForRoomChoice(roomChoiceValue)
    .map((range) => {
      const start = parseFlexibleLocalDate(range.start);
      const end = parseFlexibleLocalDate(range.end);
      if (!start || !end) return null;
      if (end.getTime() < start.getTime()) return null;
      return {
        id: `manual-${range.id}`,
        start,
        end,
        label: `Blocked ${formatAvailabilityDate(start)} to ${formatAvailabilityDate(end)}`,
        source: "manual_block" as const,
      };
    })
    .filter((w) => w !== null);

  return [...residentWindows, ...manualWindows].sort((a, b) => {
    const at = a.start?.getTime() ?? Number.NEGATIVE_INFINITY;
    const bt = b.start?.getTime() ?? Number.NEGATIVE_INFINITY;
    return at - bt;
  });
}

export function isRoomChoiceAvailable(
  roomChoiceValue: string,
  _rawAvailability: string,
  options: RoomAvailabilityOptions = {},
): boolean {
  const targetStart = parseFlexibleLocalDate(options.leaseStart) ?? startOfToday();
  const targetEnd = parseFlexibleLocalDate(options.leaseEnd);
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
  _rawAvailability: string,
  options: RoomAvailabilityOptions = {},
): string {
  const today = startOfToday();
  const windows = getRoomUnavailabilityWindows(roomChoiceValue, { excludeApplicationId: options.excludeApplicationId });

  // Check if today is within any unavailability window (point-in-time check).
  const currentBlock = windows.find((w) => {
    const wStart = w.start?.getTime() ?? Number.NEGATIVE_INFINITY;
    const wEnd = w.end?.getTime() ?? Number.POSITIVE_INFINITY;
    return today.getTime() >= wStart && today.getTime() <= wEnd;
  });

  if (currentBlock) {
    if (!currentBlock.end) {
      return currentBlock.source === "resident" ? "Unavailable (occupied)" : "Unavailable (blocked)";
    }
    return `Unavailable until ${formatAvailabilityDate(currentBlock.end)}`;
  }

  // Room is available now — find the next upcoming block.
  const nextBlock = windows
    .filter((w) => w.start && w.start.getTime() > today.getTime())
    .sort((a, b) => (a.start as Date).getTime() - (b.start as Date).getTime())[0];

  if (nextBlock?.start) {
    const until = dateMinusOneDay(nextBlock.start);
    if (until.getTime() >= today.getTime()) {
      return `Available now until ${formatAvailabilityDate(until)}`;
    }
  }

  return "Available now";
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
  return isRoomChoiceAvailable(roomId, room.available, { leaseStart, leaseEnd: endForCheck })
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
