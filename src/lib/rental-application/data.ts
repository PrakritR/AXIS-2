import { mockProperties } from "@/data/mock-properties";
import type { MockProperty } from "@/data/types";
import { readAllExtraListings, readExtraListings } from "@/lib/demo-property-pipeline";
import { normalizeManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";

export const LEASE_TERM_OPTIONS = ["3-Month", "9-Month", "12-Month", "Month-to-Month", "Custom"] as const;

export type LeaseTermOption = (typeof LEASE_TERM_OPTIONS)[number];

/** Separates listing property id from submission room id in `roomChoice*` values. */
export const LISTING_ROOM_CHOICE_SEP = "::";

export type ParsedRoomChoice = { propertyId: string; listingRoomId?: string };

export function parseRoomChoiceValue(value: string): ParsedRoomChoice {
  const v = value.trim();
  if (!v) return { propertyId: "" };
  const i = v.indexOf(LISTING_ROOM_CHOICE_SEP);
  if (i === -1) return { propertyId: v };
  return { propertyId: v.slice(0, i), listingRoomId: v.slice(i + LISTING_ROOM_CHOICE_SEP.length) };
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

/** Rooms for the selected listing: manager submission rooms, else legacy one-row-per-unit in the same building. */
export function getRoomOptionsForProperty(propertyId: string): { value: string; label: string }[] {
  const selected = getPropertyById(propertyId);
  if (!selected) return [];

  if (selected.listingSubmission?.v === 1) {
    const sub = normalizeManagerListingSubmissionV1(selected.listingSubmission);
    const roomRows = sub.rooms.filter((r) => r.name.trim());
    if (roomRows.length > 0) {
      return roomRows.map((r) => {
        const rent = r.monthlyRent > 0 ? `$${r.monthlyRent}/mo` : "Rent TBD";
        const floor = r.floor.trim();
        const label = [r.name.trim(), floor, rent].filter(Boolean).join(" · ");
        return { value: `${selected.id}${LISTING_ROOM_CHOICE_SEP}${r.id}`, label };
      });
    }
  }

  const catalog = [...mockProperties, ...readExtraListings()];
  const seen = new Set<string>();
  const out: { value: string; label: string }[] = [];
  for (const p of catalog) {
    if (p.buildingId !== selected.buildingId) continue;
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({
      value: p.id,
      label: p.unitLabel ? `${p.buildingName} · ${p.unitLabel}` : p.title,
    });
  }
  return out;
}

const NONE = "";

export function roomSelectOptionsWithNone(propertyId: string): { value: string; label: string }[] {
  return [{ value: NONE, label: "None" }, ...getRoomOptionsForProperty(propertyId)];
}

/**
 * Demo availability: one specific unit is "held" for early move-ins so we can show an error.
 * Replace with API-driven checks when backend exists.
 */
export function getDemoRoomAvailabilityMessage(roomId: string, leaseStart: string): string | null {
  if (!roomId || !leaseStart) return null;
  const { propertyId, listingRoomId } = parseRoomChoiceValue(roomId);
  const room = getPropertyById(listingRoomId ? propertyId : roomId);
  if (!room) return null;
  if (!listingRoomId && room.id === "pioneer-8b" && leaseStart < "2026-06-01") {
    return "This room is not available before June 1, 2026 for the selected lease start. Choose another room or adjust your start date.";
  }
  return null;
}
