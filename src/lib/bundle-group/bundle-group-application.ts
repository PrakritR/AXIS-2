import {
  applicationHasGroup,
  buildApplicationGroups,
  normalizeGroupId,
  type ApplicationGroup,
  type GroupRowInput,
} from "@/lib/rental-application/application-groups";
import type { RentalWizardFormState } from "@/lib/rental-application/types";

export type BundleGroupRowInput = GroupRowInput & {
  bundleId: string;
  propertyId: string;
};

export function bundleIdForApplication(app: Partial<RentalWizardFormState> | null | undefined): string {
  return (app?.bundleId ?? "").trim();
}

export function isBundleGroupApplication(app: Partial<RentalWizardFormState> | null | undefined): boolean {
  return applicationHasGroup(app) && bundleIdForApplication(app).length > 0;
}

export function bundleGroupKey(groupId: string, bundleId: string, propertyId: string): string {
  return `${normalizeGroupId(groupId)}::${bundleId.trim()}::${propertyId.trim()}`;
}

export function jointLeaseRowId(groupId: string, bundleId: string, propertyId: string): string {
  const key = bundleGroupKey(groupId, bundleId, propertyId)
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .slice(0, 120);
  return `joint_lease_${key}`;
}

export function validateBundleGroupJoin(
  organizer: Pick<RentalWizardFormState, "propertyId" | "bundleId" | "groupId">,
  joiner: Pick<RentalWizardFormState, "propertyId" | "bundleId" | "groupId">,
): string | null {
  const orgBundle = bundleIdForApplication(organizer);
  const joinBundle = bundleIdForApplication(joiner);
  if (!orgBundle) return "The organizer has not selected a lease bundle for this group.";
  if (!joinBundle) return "Select the same lease bundle as the organizer.";
  if (orgBundle !== joinBundle) return "Your bundle must match the organizer's lease bundle.";
  if (organizer.propertyId.trim() !== joiner.propertyId.trim()) {
    return "Your property must match the organizer's property.";
  }
  if (normalizeGroupId(organizer.groupId) !== normalizeGroupId(joiner.groupId)) {
    return "Your Group ID must match the organizer's Group ID.";
  }
  return null;
}

export type BundleApplicationGroup = ApplicationGroup & {
  bundleId: string | null;
  propertyId: string | null;
  bundleMismatch: boolean;
};

export function buildBundleApplicationGroups(rows: BundleGroupRowInput[]): Map<string, BundleApplicationGroup> {
  const base = buildApplicationGroups(rows);
  const groups = new Map<string, BundleApplicationGroup>();

  for (const [gid, group] of base) {
    const members = rows.filter((r) => normalizeGroupId(r.groupId) === gid);
    const bundleIds = [...new Set(members.map((m) => m.bundleId.trim()).filter(Boolean))];
    const propertyIds = [...new Set(members.map((m) => m.propertyId.trim()).filter(Boolean))];
    const bundleId = bundleIds.length === 1 ? bundleIds[0]! : bundleIds[0] ?? null;
    groups.set(gid, {
      ...group,
      bundleId,
      propertyId: propertyIds.length === 1 ? propertyIds[0]! : propertyIds[0] ?? null,
      bundleMismatch: bundleIds.length > 1,
    });
  }

  return groups;
}

export function bundleGroupReadyForJointLease(group: BundleApplicationGroup): boolean {
  if (!group.bundleId || group.bundleMismatch) return false;
  if (!group.hasFirst || group.expectedSize == null) return false;
  if (group.isOverSubscribed) return false;
  return group.isComplete && group.members.every((m) => m.status === "approved");
}

export function memberIndexInBundleGroup(
  group: ApplicationGroup,
  applicationId: string,
): number {
  const idx = group.members.findIndex((m) => m.id === applicationId);
  return idx >= 0 ? idx : 0;
}
