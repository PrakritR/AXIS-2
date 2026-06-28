/** Permissions a primary manager grants to linked co-managers (account links). */

export const CO_MANAGER_PERMISSION_OPTIONS = [
  { id: "properties", label: "Properties & listings" },
  { id: "editListings", label: "Edit assigned listings" },
  { id: "applications", label: "Applications" },
  { id: "residents", label: "Residents" },
  { id: "leases", label: "Leases" },
  { id: "payments", label: "Payments" },
  { id: "documents", label: "Documents" },
  { id: "financials", label: "Finances" },
  { id: "services", label: "Services & work orders" },
  { id: "inbox", label: "Inbox" },
  { id: "calendar", label: "Calendar" },
] as const;

export type CoManagerPermissionId = (typeof CO_MANAGER_PERMISSION_OPTIONS)[number]["id"];

export type CoManagerPermissions = Partial<Record<CoManagerPermissionId, boolean>>;

export const EMPTY_CO_MANAGER_PERMISSIONS: CoManagerPermissions = {};

export function normalizeCoManagerPermissions(raw: unknown): CoManagerPermissions {
  if (!raw || typeof raw !== "object") return {};
  const out: CoManagerPermissions = {};
  for (const { id } of CO_MANAGER_PERMISSION_OPTIONS) {
    if ((raw as Record<string, unknown>)[id] === true) out[id] = true;
  }
  return out;
}

/** Map legacy single checkbox to structured permissions. */
export function coManagerPermissionsFromLegacy(input: {
  canEditListing?: boolean;
  coManagerPermissions?: unknown;
}): CoManagerPermissions {
  const base = normalizeCoManagerPermissions(input.coManagerPermissions);
  if (input.canEditListing && !base.editListings) {
    return { ...base, editListings: true };
  }
  return base;
}

export function hasCoManagerPermission(
  permissions: CoManagerPermissions | undefined,
  id: CoManagerPermissionId,
): boolean {
  return permissions?.[id] === true;
}

export function countCoManagerPermissions(permissions: CoManagerPermissions | undefined): number {
  return CO_MANAGER_PERMISSION_OPTIONS.filter(({ id }) => hasCoManagerPermission(permissions, id)).length;
}

/** Portal nav sections that co-managers may always open (no grant required). */
export const CO_MANAGER_ALWAYS_ALLOWED_SECTIONS = new Set([
  "dashboard",
  "profile",
  "plan",
  "bugs-feedback",
]);

/** Map property portal sections to co-manager permission ids. */
export const PORTAL_SECTION_CO_MANAGER_PERMISSION: Partial<Record<string, CoManagerPermissionId>> = {
  properties: "properties",
  applications: "applications",
  residents: "residents",
  leases: "leases",
  payments: "payments",
  documents: "documents",
  financials: "financials",
  inbox: "inbox",
  calendar: "calendar",
  services: "services",
};

function coManagerHasSectionPermission(
  section: string,
  permissions: CoManagerPermissions,
): boolean {
  const perm = PORTAL_SECTION_CO_MANAGER_PERMISSION[section];
  if (!perm) return false;
  if (hasCoManagerPermission(permissions, perm)) return true;
  // Legacy grants: properties permission also unlocked services before services was its own checkbox.
  if (section === "services" && hasCoManagerPermission(permissions, "properties")) return true;
  return false;
}

export function mergeCoManagerPermissions(
  rows: { coManagerPermissions?: CoManagerPermissions }[],
): CoManagerPermissions {
  const merged: CoManagerPermissions = {};
  for (const row of rows) {
    for (const { id } of CO_MANAGER_PERMISSION_OPTIONS) {
      if (hasCoManagerPermission(row.coManagerPermissions, id)) merged[id] = true;
    }
  }
  return merged;
}

export function coManagerPortalSectionAllowed(input: {
  section: string;
  isPrimaryManager: boolean;
  mergedPermissions: CoManagerPermissions;
}): boolean {
  if (input.isPrimaryManager) return true;
  if (input.section === "relationships") return false;
  if (CO_MANAGER_ALWAYS_ALLOWED_SECTIONS.has(input.section)) return true;
  return coManagerHasSectionPermission(input.section, input.mergedPermissions);
}
