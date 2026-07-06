import { readExtraListingsForUser, readPendingManagerPropertiesForUser } from "@/lib/demo-property-pipeline";
import { updateRequestChangeProperty } from "@/lib/demo-admin-property-inventory";
import { updateExtraListingFromSubmission, updatePendingManagerProperty } from "@/lib/demo-property-pipeline";
import { parseMonthlyRent } from "@/lib/listings-search";
import {
  legacyAdminFieldsToSubmission,
  normalizeManagerListingSubmissionV1,
  type ManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";
import type { MockProperty } from "@/data/types";
import type { ManagerPendingPropertyRow } from "@/lib/demo-property-pipeline";

export type ManagerPropertySaveTarget = {
  mode: "pending" | "listing" | "requestChange";
  saveId: string;
};

function submissionForListedEdit(p: MockProperty): ManagerListingSubmissionV1 {
  if (p.listingSubmission) return normalizeManagerListingSubmissionV1(p.listingSubmission);
  const rentNum = parseMonthlyRent(String(p.rentLabel ?? "")) ?? 0;
  return normalizeManagerListingSubmissionV1(
    legacyAdminFieldsToSubmission({
      buildingName: p.buildingName,
      address: p.address,
      zip: p.zip,
      neighborhood: p.neighborhood,
      unitLabel: p.unitLabel,
      beds: p.beds,
      baths: p.baths,
      monthlyRent: rentNum,
      petFriendly: p.petFriendly,
      tagline: p.tagline,
    }),
  );
}

function submissionForPendingEdit(row: ManagerPendingPropertyRow): ManagerListingSubmissionV1 {
  const raw = row.submission ? row.submission : legacyAdminFieldsToSubmission(row);
  return normalizeManagerListingSubmissionV1(raw);
}

export function persistManagerListingSubmission(
  saveTarget: ManagerPropertySaveTarget,
  managerUserId: string,
  next: ManagerListingSubmissionV1,
): boolean {
  if (saveTarget.mode === "pending") {
    return updatePendingManagerProperty(saveTarget.saveId, next, managerUserId);
  }
  if (saveTarget.mode === "listing") {
    return updateExtraListingFromSubmission(saveTarget.saveId, managerUserId, next);
  }
  return updateRequestChangeProperty(saveTarget.saveId, managerUserId, next);
}

export function resolveManagerListingSubmissionForPropertyId(
  managerUserId: string | null,
  propertyId: string,
): { sub: ManagerListingSubmissionV1; saveTarget: ManagerPropertySaveTarget } | null {
  const saveTarget = resolvePropertySaveTargetById(managerUserId, propertyId);
  if (!saveTarget || !managerUserId) return null;
  const id = propertyId.trim();
  const listing = readExtraListingsForUser(managerUserId).find((p) => p.id === id);
  if (listing) {
    return { sub: submissionForListedEdit(listing), saveTarget };
  }
  const pending = readPendingManagerPropertiesForUser(managerUserId).find((p) => p.id === id);
  if (pending) {
    return { sub: submissionForPendingEdit(pending), saveTarget };
  }
  return null;
}

/**
 * Maps the pieces the admin property table already resolves per-row (portal
 * submission save mode, admin bucket, listing id) onto the {mode, saveId}
 * shape the property editor panels persist through. Pure extraction of the
 * decision logic previously inlined in manager-house-properties-panel.tsx.
 */
export function resolvePropertySaveTarget(input: {
  portalSaveMode?: "pending" | "listing" | "requestChange";
  portalSaveId?: string;
  bucket?: number | null;
  adminRefId?: string | null;
  listingId?: string | null;
}): ManagerPropertySaveTarget | null {
  const { portalSaveMode, portalSaveId, bucket, adminRefId, listingId } = input;
  if (portalSaveMode && portalSaveId) return { mode: portalSaveMode, saveId: portalSaveId };
  if (bucket === 0 && adminRefId) return { mode: "pending", saveId: adminRefId };
  if (listingId?.trim()) return { mode: "listing", saveId: listingId.trim() };
  return null;
}

/**
 * Resolves a save target from just a propertyId, as selected in the manager
 * "Add request" modal's property dropdown — those options only ever come
 * from a manager's listed properties or pending drafts (never a property
 * mid-request-change), so this never returns "requestChange".
 */
export function resolvePropertySaveTargetById(
  managerUserId: string | null,
  propertyId: string,
): ManagerPropertySaveTarget | null {
  const id = propertyId.trim();
  if (!managerUserId || !id) return null;
  if (readExtraListingsForUser(managerUserId).some((p) => p.id === id)) {
    return resolvePropertySaveTarget({ listingId: id });
  }
  if (readPendingManagerPropertiesForUser(managerUserId).some((p) => p.id === id)) {
    return resolvePropertySaveTarget({ bucket: 0, adminRefId: id });
  }
  return null;
}
