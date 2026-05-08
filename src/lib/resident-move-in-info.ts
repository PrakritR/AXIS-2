import type { DemoApplicantRow } from "@/data/demo-portal";
import { effectiveApplicationForRow } from "@/lib/manager-applications-storage";
import { normalizeManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { getPropertyById, getRoomChoiceLabel, parseRoomChoiceValue } from "@/lib/rental-application/data";
import { getPortalListingNote } from "@/lib/portal-listing-notes";

export type ResidentMoveInResolved = {
  propertyLabel: string;
  addressLine: string;
  roomLabel: string;
  earliestMoveInDateLabel: string | null;
  instructions: string | null;
};

function formatMoveInDateLabel(iso: string): string {
  const t = iso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const [y, m, d] = t.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return t;
  return dt.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

/** Resolve move-in copy for the signed-in resident from approved application + listing submission. */
export function resolveResidentMoveInFromApplications(
  email: string,
  applications: DemoApplicantRow[],
): ResidentMoveInResolved | null {
  const e = email.trim().toLowerCase();
  if (!e) return null;

  const row = applications.find((a) => a.email?.trim().toLowerCase() === e && a.bucket === "approved");
  if (!row) return null;

  const effective = effectiveApplicationForRow(row);
  const pid =
    row.assignedPropertyId?.trim() ||
    row.propertyId?.trim() ||
    effective?.propertyId?.trim() ||
    "";

  const roomChoice =
    row.assignedRoomChoice?.trim() || effective?.roomChoice1?.trim() || "";

  const property = pid ? getPropertyById(pid) : undefined;
  const sub =
    property?.listingSubmission?.v === 1 ? normalizeManagerListingSubmissionV1(property.listingSubmission) : null;

  // Resolve managerUserId for portal notes lookup
  const managerUserId = row.managerUserId?.trim() || property?.managerUserId?.trim() || "";

  let roomLabel = roomChoice ? getRoomChoiceLabel(roomChoice) : row.property?.trim() || "Your room";
  let earliestMoveInDateLabel: string | null = null;
  let instructions: string | null = null;
  let listingRoomId: string | null = null;

  if (sub && roomChoice) {
    const parsed = parseRoomChoiceValue(roomChoice);
    listingRoomId = parsed.listingRoomId ?? null;
    const room = listingRoomId ? sub.rooms.find((r) => r.id === listingRoomId) : undefined;
    if (room) {
      if (room.name.trim()) roomLabel = room.name.trim();
      const d = room.moveInAvailableDate?.trim();
      if (d) earliestMoveInDateLabel = formatMoveInDateLabel(d);
      // Listing submission instructions as lowest-priority fallback
      const subIns = room.moveInInstructions?.trim();
      if (subIns) instructions = subIns;
    }
  }

  // Per-resident override (set in Residents panel) — second priority, overrides submission
  if (row.moveInInstructions?.trim()) {
    instructions = row.moveInInstructions.trim();
  }

  // Portal note room instructions take highest priority (manager edits Room Details in Properties panel)
  if (managerUserId && pid && listingRoomId) {
    const noteKey = `${managerUserId}:${pid}`;
    const portalNote = getPortalListingNote(noteKey);
    const noteIns = portalNote.rooms?.[listingRoomId]?.moveInInstructions?.trim();
    if (noteIns) instructions = noteIns;
  }

  return {
    propertyLabel: sub?.buildingName || property?.buildingName || property?.title || row.property?.trim() || "Your property",
    addressLine: sub ? [sub.address, sub.zip].filter(Boolean).join(", ").trim() : property?.address?.trim() || "",
    roomLabel,
    earliestMoveInDateLabel,
    instructions,
  };
}
