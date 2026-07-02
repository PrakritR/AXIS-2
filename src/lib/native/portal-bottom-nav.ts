import type { PortalDefinition } from "@/lib/portal-types";

/** Settings tab — always pinned to the end of the native bottom bar. */
const SETTINGS_SECTION = "profile";

/** @deprecated All sections scroll in the native bar; kept for compatibility. */
export const NATIVE_BOTTOM_NAV_PRIMARY_LIMIT = 7;

/** @deprecated Use {@link NATIVE_BOTTOM_NAV_PRIMARY_LIMIT}. */
export const NATIVE_BOTTOM_NAV_SLOT_LIMIT = NATIVE_BOTTOM_NAV_PRIMARY_LIMIT;

/**
 * Manager / pro footer order — mirrors `proPortal.sections` (Settings omitted; pinned last in the bar).
 * Keep in sync with `src/lib/portals/pro.ts`.
 */
export const NATIVE_BOTTOM_NAV_PRO_MANAGER_ORDER = [
  "dashboard",
  "properties",
  "calendar",
  "applications",
  "residents",
  "leases",
  "payments",
  "services",
  "inbox",
  "documents",
  "financials",
  "relationships",
  "bugs-feedback",
] as const;

/**
 * Resident footer order — mirrors resident portal registries (Settings omitted; pinned last).
 * Keep in sync with `src/lib/portals/resident-sections.ts`.
 */
export const NATIVE_BOTTOM_NAV_RESIDENT_ORDER = [
  "dashboard",
  "lease",
  "payments",
  "move-in",
  "services",
  "inbox",
  "documents",
  "bugs-feedback",
] as const;

/**
 * Native bottom bar order — preserves portal registry order (web sidebar = native bar).
 * Settings is always appended last when present.
 */
export function orderNativeBottomNavItems<T extends { section: string }>(
  items: T[],
  _kind?: PortalDefinition["kind"],
): T[] {
  if (items.length === 0) return [];

  const settings = items.find((item) => item.section === SETTINGS_SECTION);
  const rest = items.filter((item) => item.section !== SETTINGS_SECTION);

  if (settings) return [...rest, settings];
  return [...items];
}

/** All sections in the scrollable native bar (no More overflow). */
export function splitNativeBottomNavItems<T extends { section: string }>(
  items: T[],
  kind?: PortalDefinition["kind"],
): { primary: T[]; overflow: T[] } {
  const ordered = orderNativeBottomNavItems(items, kind);
  return { primary: ordered, overflow: [] };
}

/** @deprecated Use splitNativeBottomNavItems — kept for tests. */
export function pickNativeBottomNavItems<T extends { section: string }>(
  items: T[],
  kind?: PortalDefinition["kind"],
): T[] {
  return orderNativeBottomNavItems(items, kind);
}
