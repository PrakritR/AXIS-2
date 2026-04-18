import { mockProperties } from "@/data/mock-properties";
import type { MockProperty } from "@/data/types";
import { readExtraListings } from "@/lib/demo-property-pipeline";

export const LEASE_TERM_OPTIONS = ["3-Month", "9-Month", "12-Month", "Month-to-Month", "Custom"] as const;

export type LeaseTermOption = (typeof LEASE_TERM_OPTIONS)[number];

/** Dropdown: one row per listing (property + unit). */
export function getPropertySelectOptions(): { value: string; label: string }[] {
  return mockProperties.map((p) => ({
    value: p.id,
    label: p.title,
  }));
}

export function getPropertyById(id: string): MockProperty | undefined {
  return mockProperties.find((p) => p.id === id) ?? readExtraListings().find((p) => p.id === id);
}

/** Rooms in the same building as the selected listing (for 1st/2nd/3rd choice). */
export function getRoomOptionsForProperty(propertyId: string): { value: string; label: string }[] {
  const selected = getPropertyById(propertyId);
  if (!selected) return [];
  return mockProperties
    .filter((p) => p.buildingId === selected.buildingId)
    .map((p) => ({
      value: p.id,
      label: p.unitLabel ? `${p.buildingName} · ${p.unitLabel}` : p.title,
    }));
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
  const room = getPropertyById(roomId);
  if (!room) return null;
  if (room.id === "pioneer-8b" && leaseStart < "2026-06-01") {
    return "This room is not available before June 1, 2026 for the selected lease start. Choose another room or adjust your start date.";
  }
  return null;
}
