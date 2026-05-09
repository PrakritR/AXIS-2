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

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function resolveBestResidentRow(email: string, applications: DemoApplicantRow[]): DemoApplicantRow | null {
  const matches = applications.filter((a) => a.email?.trim().toLowerCase() === email && a.bucket === "approved");
  if (matches.length === 0) return null;
  return [...matches].sort((a, b) => {
    const aAssigned = Number(Boolean(a.assignedPropertyId?.trim() || a.propertyId?.trim()));
    const bAssigned = Number(Boolean(b.assignedPropertyId?.trim() || b.propertyId?.trim()));
    if (aAssigned !== bAssigned) return bAssigned - aAssigned;

    const aRoom = Number(
      Boolean(a.assignedRoomChoice?.trim() || a.application?.roomChoice1?.trim() || a.manualResidentDetails?.roomNumber?.trim()),
    );
    const bRoom = Number(
      Boolean(b.assignedRoomChoice?.trim() || b.application?.roomChoice1?.trim() || b.manualResidentDetails?.roomNumber?.trim()),
    );
    if (aRoom !== bRoom) return bRoom - aRoom;

    const aManualDate = Number(Boolean(a.manualResidentDetails?.moveInDate?.trim()));
    const bManualDate = Number(Boolean(b.manualResidentDetails?.moveInDate?.trim()));
    if (aManualDate !== bManualDate) return bManualDate - aManualDate;

    return applications.indexOf(b) - applications.indexOf(a);
  })[0] ?? null;
}

/** Resolve move-in copy for the signed-in resident from approved application + listing submission. */
export function resolveResidentMoveInFromApplications(
  email: string,
  applications: DemoApplicantRow[],
): ResidentMoveInResolved | null {
  const e = email.trim().toLowerCase();
  if (!e) return null;

  const row = resolveBestResidentRow(e, applications);
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
  let portalRoomMoveInDate: string | null = null;
  let portalRoomInstructions: string | null = null;
  let roomLevelMoveInDate: string | null = null;
  let roomLevelInstructions: string | null = null;

  if (sub) {
    const parsed = roomChoice ? parseRoomChoiceValue(roomChoice) : null;
    listingRoomId = parsed?.listingRoomId ?? null;
    const manualRoomName = row.manualResidentDetails?.roomNumber?.trim().toLowerCase() || "";
    const room =
      (listingRoomId ? sub.rooms.find((r) => r.id === listingRoomId) : undefined) ??
      (manualRoomName ? sub.rooms.find((r) => r.name.trim().toLowerCase() === manualRoomName) : undefined);

    if (room) {
      listingRoomId = room.id;
      if (room.name.trim()) roomLabel = room.name.trim();
      roomLevelMoveInDate = room.moveInAvailableDate?.trim() || null;
      roomLevelInstructions = room.moveInInstructions?.trim() || null;
    }
  }

  if (managerUserId && pid && listingRoomId) {
    const noteKey = `${managerUserId}:${pid}`;
    const portalNote = getPortalListingNote(noteKey);
    portalRoomMoveInDate = portalNote.rooms?.[listingRoomId]?.moveInAvailableDate?.trim() || null;
    portalRoomInstructions = portalNote.rooms?.[listingRoomId]?.moveInInstructions?.trim() || null;
  }

  const rowLevelInstructions = row.moveInInstructions?.trim() || null;
  const manualMoveInDate = row.manualResidentDetails?.moveInDate?.trim() || null;
  const applicationMoveInDate = effective?.leaseStart?.trim() || null;

  earliestMoveInDateLabel = formatMoveInDateLabel(
    firstNonEmpty(portalRoomMoveInDate, roomLevelMoveInDate, manualMoveInDate, applicationMoveInDate) ?? "",
  ) || null;
  instructions = firstNonEmpty(portalRoomInstructions, roomLevelInstructions, rowLevelInstructions);

  return {
    propertyLabel: sub?.buildingName || property?.buildingName || property?.title || row.property?.trim() || "Your property",
    addressLine: sub ? [sub.address, sub.zip].filter(Boolean).join(", ").trim() : property?.address?.trim() || "",
    roomLabel,
    earliestMoveInDateLabel,
    instructions,
  };
}
