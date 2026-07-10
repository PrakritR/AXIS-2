/** Pure move-in resolution from application rows + listing submissions — client-safe (no Supabase imports). */

import type { DemoApplicantRow } from "@/data/demo-portal";
import { splitLineList } from "@/data/manager-listing-presets";
import type { MockProperty } from "@/data/types";
import { normalizeManagerListingSubmissionV1, isEntireHomeListing } from "@/lib/manager-listing-submission";
import { parseRoomChoiceValue } from "@/lib/rental-application/data";

export type ResidentMoveInResolved = {
  propertyLabel: string;
  addressLine: string;
  roomLabel: string;
  earliestMoveInDateLabel: string | null;
  instructions: string | null;
  generalHouseInfo: string | null;
  houseRulesText: string | null;
  /** Property amenities offered (from the listing's amenitiesText), one entry per amenity. */
  amenities: string[];
  wifiNetworkName: string | null;
  wifiPassword: string | null;
};

export function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

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

export function resolveBestResidentRow(email: string, applications: DemoApplicantRow[]): DemoApplicantRow | null {
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

export function propertyFromRecord(record: { id: string; property_data: unknown; row_data: unknown }): MockProperty | undefined {
  const propertyData = asObject(record.property_data);
  if (propertyData) {
    const id = asString(propertyData.id) || record.id;
    const buildingName = asString(propertyData.buildingName);
    const title = asString(propertyData.title) || buildingName || "Property";
    return {
      id,
      title,
      tagline: asString(propertyData.tagline),
      address: asString(propertyData.address),
      zip: asString(propertyData.zip),
      neighborhood: asString(propertyData.neighborhood),
      beds: typeof propertyData.beds === "number" ? propertyData.beds : 0,
      baths: typeof propertyData.baths === "number" ? propertyData.baths : 0,
      rentLabel: asString(propertyData.rentLabel),
      available: asString(propertyData.available),
      petFriendly: Boolean(propertyData.petFriendly),
      buildingId: asString(propertyData.buildingId) || id,
      buildingName: buildingName || title,
      unitLabel: asString(propertyData.unitLabel),
      listingSubmission: propertyData.listingSubmission as MockProperty["listingSubmission"],
      managerUserId: asString(propertyData.managerUserId) || undefined,
      adminPublishLive: Boolean(propertyData.adminPublishLive),
    };
  }

  const rowData = asObject(record.row_data);
  if (!rowData) return undefined;
  const submission = asObject(rowData.submission);
  if (!submission) return undefined;

  const buildingName = asString(rowData.buildingName) || asString(submission.buildingName) || "Property";
  return {
    id: record.id,
    title: buildingName,
    tagline: asString(rowData.tagline),
    address: asString(rowData.address) || asString(submission.address),
    zip: asString(rowData.zip) || asString(submission.zip),
    neighborhood: asString(rowData.neighborhood),
    beds: typeof rowData.beds === "number" ? rowData.beds : 0,
    baths: typeof rowData.baths === "number" ? rowData.baths : 0,
    rentLabel: "",
    available: "",
    petFriendly: Boolean(rowData.petFriendly),
    buildingId: record.id,
    buildingName,
    unitLabel: asString(rowData.unitLabel),
    listingSubmission: submission as MockProperty["listingSubmission"],
    managerUserId: undefined,
    adminPublishLive: false,
  };
}

/** Resolve move-in copy for the signed-in resident from approved application + listing submission. */
export function resolveResidentMoveInFromApplications(
  email: string,
  applications: DemoApplicantRow[],
  propertiesById: Record<string, MockProperty | undefined> = {},
): ResidentMoveInResolved | null {
  const e = email.trim().toLowerCase();
  if (!e) return null;

  const row = resolveBestResidentRow(e, applications);
  if (!row) return null;

  const pid =
    row.assignedPropertyId?.trim() ||
    row.propertyId?.trim() ||
    row.application?.propertyId?.trim() ||
    "";

  const roomChoice =
    row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "";

  const property = pid ? propertiesById[pid] : undefined;
  const sub =
    property?.listingSubmission?.v === 1 ? normalizeManagerListingSubmissionV1(property.listingSubmission) : null;

  const propertyTitleVariants = new Set(
    [
      property?.title?.trim(),
      property?.buildingName?.trim(),
      `${property?.buildingName?.trim() ?? ""} · ${property?.unitLabel?.trim() ?? ""}`.trim(),
    ].filter(Boolean) as string[],
  );

  function isPropertyFallbackLabel(s: string): boolean {
    if (!s) return true;
    const sl = s.toLowerCase();
    for (const v of propertyTitleVariants) {
      if (sl === v.toLowerCase() || sl.startsWith(v.toLowerCase())) return true;
    }
    return false;
  }

  let roomLabel = "Not assigned yet";
  const manualRoomNumber = row.manualResidentDetails?.roomNumber?.trim() || "";
  if (roomChoice) {
    if (manualRoomNumber && !isPropertyFallbackLabel(manualRoomNumber)) {
      roomLabel = manualRoomNumber;
    }
  } else if (manualRoomNumber && !isPropertyFallbackLabel(manualRoomNumber)) {
    roomLabel = manualRoomNumber;
  }

  let roomLevelInstructions: string | null = null;
  let listingMoveInDate: string | null = null;
  if (sub) {
    if (isEntireHomeListing(sub)) {
      listingMoveInDate = sub.houseMoveInAvailableDate?.trim() || null;
      roomLevelInstructions = sub.houseMoveInInstructions?.trim() || null;
    }
    const parsed = roomChoice ? parseRoomChoiceValue(roomChoice) : null;
    const listingRoomId = parsed?.listingRoomId ?? null;
    const manualRoomName = !isPropertyFallbackLabel(manualRoomNumber) ? manualRoomNumber.toLowerCase() : "";
    const room =
      (listingRoomId ? sub.rooms.find((r) => r.id === listingRoomId) : undefined) ??
      (manualRoomName ? sub.rooms.find((r) => r.name.trim().toLowerCase() === manualRoomName) : undefined);

    if (room) {
      const rn = room.name.trim();
      if (rn && !isPropertyFallbackLabel(rn)) roomLabel = rn;
      if (!isEntireHomeListing(sub)) {
        listingMoveInDate = room.moveInAvailableDate?.trim() || null;
        roomLevelInstructions = room.moveInInstructions?.trim() || null;
      } else if (!roomLevelInstructions) {
        roomLevelInstructions = room.moveInInstructions?.trim() || null;
      }
    }
  }

  const earliestMoveInDateLabel =
    formatMoveInDateLabel(
      firstNonEmpty(row.manualResidentDetails?.moveInDate, row.application?.leaseStart, listingMoveInDate) ?? "",
    ) || null;
  const instructions = firstNonEmpty(roomLevelInstructions, row.moveInInstructions);
  const generalHouseInfo = sub?.generalHouseInfo?.trim() || null;
  const houseRulesText = sub?.houseRulesText?.trim() || null;
  const amenities = sub ? splitLineList(sub.amenitiesText ?? "") : [];
  // Wi-Fi is no longer collected or shown on move-in.
  const wifiNetworkName = null;
  const wifiPassword = null;

  return {
    propertyLabel:
      sub?.buildingName?.trim() ||
      property?.buildingName?.trim() ||
      property?.title?.trim() ||
      row.property?.trim() ||
      "Your property",
    addressLine: sub ? [sub.address, sub.zip].filter(Boolean).join(", ").trim() : property?.address?.trim() || "",
    roomLabel,
    earliestMoveInDateLabel,
    instructions,
    generalHouseInfo,
    houseRulesText,
    amenities,
    wifiNetworkName,
    wifiPassword,
  };
}
