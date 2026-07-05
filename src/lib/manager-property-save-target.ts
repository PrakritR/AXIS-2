import { readExtraListingsForUser, readPendingManagerPropertiesForUser } from "@/lib/demo-property-pipeline";

export type ManagerPropertySaveTarget = {
  mode: "pending" | "listing" | "requestChange";
  saveId: string;
};

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
