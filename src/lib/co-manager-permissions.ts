/** Permissions a primary manager grants to linked co-managers (account links). */

/** Shown in the co-manager permissions editor. `editListings` is implied by `properties`. */
export const CO_MANAGER_PERMISSION_OPTIONS = [
  { id: "properties", label: "Properties" },
  { id: "applications", label: "Applications" },
  { id: "residents", label: "Residents" },
  { id: "leases", label: "Leases" },
  { id: "payments", label: "Payments" },
  { id: "documents", label: "Documents" },
  { id: "financials", label: "Finances" },
  { id: "services", label: "Services" },
  { id: "promotion", label: "Promotion" },
  { id: "inbox", label: "Inbox" },
  { id: "calendar", label: "Calendar" },
] as const;

/** Legacy ids still accepted when reading stored rows. */
const LEGACY_CO_MANAGER_PERMISSION_IDS = ["editListings"] as const;

export type CoManagerPermissionId =
  | (typeof CO_MANAGER_PERMISSION_OPTIONS)[number]["id"]
  | (typeof LEGACY_CO_MANAGER_PERMISSION_IDS)[number];

/** Access dimensions per module (granular RBAC). */
export type CoManagerPermissionLevel = "read" | "edit" | "delete";

/**
 * A module grant: legacy `true` = full access (read+edit+delete); the granular
 * object form scopes by level. `edit` / `delete` imply `read`.
 */
export type CoManagerPermissionGrant =
  | boolean
  | { read?: boolean; edit?: boolean; delete?: boolean };

export type CoManagerPermissions = Partial<Record<CoManagerPermissionId, CoManagerPermissionGrant>>;

function grantAllows(grant: CoManagerPermissionGrant | undefined, level: CoManagerPermissionLevel): boolean {
  if (grant === true) return true;
  if (!grant || typeof grant !== "object") return false;
  if (level === "read") return grant.read === true || grant.edit === true || grant.delete === true;
  return grant[level] === true;
}

function normalizeGrant(raw: unknown): CoManagerPermissionGrant | undefined {
  if (raw === true) return true;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const grant: { read?: boolean; edit?: boolean; delete?: boolean } = {};
    if (o.read === true) grant.read = true;
    if (o.edit === true) grant.edit = true;
    if (o.delete === true) grant.delete = true;
    return Object.keys(grant).length > 0 ? grant : undefined;
  }
  return undefined;
}

function unionGrants(
  a: CoManagerPermissionGrant | undefined,
  b: CoManagerPermissionGrant | undefined,
): CoManagerPermissionGrant | undefined {
  if (a === true || b === true) return true;
  const merged: { read?: boolean; edit?: boolean; delete?: boolean } = {};
  for (const level of ["read", "edit", "delete"] as const) {
    if (grantAllows(a, level) || grantAllows(b, level)) merged[level] = true;
  }
  if (merged.read && merged.edit && merged.delete) return true;
  return Object.keys(merged).length > 0 ? merged : undefined;
}

/** Per-property permission grants on an account link. */
export type PropertyCoManagerPermissions = Record<string, CoManagerPermissions>;

export const EMPTY_CO_MANAGER_PERMISSIONS: CoManagerPermissions = {};

const CO_MANAGER_PERMISSION_ID_SET = new Set<string>([
  ...CO_MANAGER_PERMISSION_OPTIONS.map(({ id }) => id),
  ...LEGACY_CO_MANAGER_PERMISSION_IDS,
]);

function isFlatCoManagerPermissionsObject(raw: Record<string, unknown>): boolean {
  const keys = Object.keys(raw);
  if (keys.length === 0) return true;
  return keys.some((k) => CO_MANAGER_PERMISSION_ID_SET.has(k));
}

export function normalizeCoManagerPermissions(raw: unknown): CoManagerPermissions {
  if (!raw || typeof raw !== "object") return {};
  const out: CoManagerPermissions = {};
  for (const { id } of CO_MANAGER_PERMISSION_OPTIONS) {
    const grant = normalizeGrant((raw as Record<string, unknown>)[id]);
    if (grant !== undefined) out[id] = grant;
  }
  for (const id of LEGACY_CO_MANAGER_PERMISSION_IDS) {
    const grant = normalizeGrant((raw as Record<string, unknown>)[id]);
    if (grant !== undefined) out[id] = grant;
  }
  if (out.editListings && !out.properties) out.properties = out.editListings;
  return out;
}

export function normalizePropertyCoManagerPermissions(
  raw: unknown,
  assignedPropertyIds: string[],
): PropertyCoManagerPermissions {
  if (!raw || typeof raw !== "object") {
    return Object.fromEntries(assignedPropertyIds.map((id) => [id, {}]));
  }
  const obj = raw as Record<string, unknown>;
  if (isFlatCoManagerPermissionsObject(obj)) {
    const flat = normalizeCoManagerPermissions(obj);
    return Object.fromEntries(assignedPropertyIds.map((id) => [id, { ...flat }]));
  }
  const out: PropertyCoManagerPermissions = {};
  for (const propertyId of assignedPropertyIds) {
    out[propertyId] = normalizeCoManagerPermissions(obj[propertyId]);
  }
  for (const [key, value] of Object.entries(obj)) {
    if (!assignedPropertyIds.includes(key)) continue;
    out[key] = normalizeCoManagerPermissions(value);
  }
  return out;
}

export function permissionsForProperty(
  perms: PropertyCoManagerPermissions | undefined,
  propertyId: string,
): CoManagerPermissions {
  return normalizeCoManagerPermissions(perms?.[propertyId]);
}

export function prunePropertyCoManagerPermissions(
  perms: PropertyCoManagerPermissions,
  assignedPropertyIds: string[],
): PropertyCoManagerPermissions {
  const allowed = new Set(assignedPropertyIds);
  const out: PropertyCoManagerPermissions = {};
  for (const id of assignedPropertyIds) {
    out[id] = normalizeCoManagerPermissions(perms[id]);
  }
  for (const [key, value] of Object.entries(perms)) {
    if (!allowed.has(key)) continue;
    out[key] = normalizeCoManagerPermissions(value);
  }
  return out;
}

export function flatCoManagerPermissionsFromProperty(
  perms: PropertyCoManagerPermissions | undefined,
): CoManagerPermissions {
  return mergeCoManagerPermissions(
    Object.values(perms ?? {}).map((coManagerPermissions) => ({ coManagerPermissions })),
  );
}

export function summarizePropertyCoManagerPermissions(
  perms: PropertyCoManagerPermissions | undefined,
): string {
  const flat = flatCoManagerPermissionsFromProperty(perms);
  const labels = CO_MANAGER_PERMISSION_OPTIONS.filter(({ id }) => hasCoManagerPermission(flat, id)).map(
    ({ label }) => label,
  );
  return labels.join(" · ") || "No section access granted yet.";
}

/** Map legacy single checkbox to structured permissions. */
export function coManagerPermissionsFromLegacy(input: {
  canEditListing?: boolean;
  coManagerPermissions?: unknown;
}): CoManagerPermissions {
  const base = normalizeCoManagerPermissions(input.coManagerPermissions);
  if (input.canEditListing && !base.properties) {
    return { ...base, properties: true };
  }
  if (base.editListings && !base.properties) {
    return { ...base, properties: true };
  }
  return base;
}

/** Any access to the module (read level; `true` and any granular grant qualify). */
export function hasCoManagerPermission(
  permissions: CoManagerPermissions | undefined,
  id: CoManagerPermissionId,
): boolean {
  return hasCoManagerPermissionLevel(permissions, id, "read");
}

/** Level-specific access check. Legacy `true` grants every level. */
export function hasCoManagerPermissionLevel(
  permissions: CoManagerPermissions | undefined,
  id: CoManagerPermissionId,
  level: CoManagerPermissionLevel,
): boolean {
  if (id === "editListings") {
    return grantAllows(permissions?.properties, level) || grantAllows(permissions?.editListings, level);
  }
  return grantAllows(permissions?.[id], level);
}

export function hasCoManagerPermissionLevelForProperty(
  propertyPermissions: PropertyCoManagerPermissions | undefined,
  propertyId: string,
  id: CoManagerPermissionId,
  level: CoManagerPermissionLevel,
): boolean {
  return hasCoManagerPermissionLevel(permissionsForProperty(propertyPermissions, propertyId), id, level);
}

export function hasCoManagerPermissionForProperty(
  propertyPermissions: PropertyCoManagerPermissions | undefined,
  propertyId: string,
  id: CoManagerPermissionId,
): boolean {
  return hasCoManagerPermission(permissionsForProperty(propertyPermissions, propertyId), id);
}

export function countCoManagerPermissions(permissions: CoManagerPermissions | undefined): number {
  return CO_MANAGER_PERMISSION_OPTIONS.filter(({ id }) => hasCoManagerPermission(permissions, id)).length;
}

/** Portal nav sections that co-managers may always open (no grant required). */
export const CO_MANAGER_ALWAYS_ALLOWED_SECTIONS = new Set([
  "dashboard",
  "profile",
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
  promotion: "promotion",
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
      const next = unionGrants(merged[id], row.coManagerPermissions?.[id]);
      if (next !== undefined) merged[id] = next;
    }
  }
  return merged;
}

export function mergeCoManagerPermissionsFromPropertyRows(
  rows: { propertyCoManagerPermissions?: PropertyCoManagerPermissions; coManagerPermissions?: CoManagerPermissions }[],
): CoManagerPermissions {
  const propertyValues = rows.flatMap((row) => {
    const map = row.propertyCoManagerPermissions;
    if (map && Object.keys(map).length > 0) {
      return Object.values(map).map((coManagerPermissions) => ({ coManagerPermissions }));
    }
    if (row.coManagerPermissions && Object.keys(row.coManagerPermissions).length > 0) {
      return [{ coManagerPermissions: row.coManagerPermissions }];
    }
    return [];
  });
  return mergeCoManagerPermissions(propertyValues);
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
