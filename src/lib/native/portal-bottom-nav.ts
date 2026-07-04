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
  "promotion",
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

/**
 * Curated primary sets for the fixed native bottom bar — one screen's worth of
 * one-tap tabs per role. Everything else in the portal registry is still reachable
 * via the swipe-up "More" sheet. Keep in sync with `src/lib/platform/parity.ts`.
 */
export const NATIVE_BOTTOM_NAV_PRO_MANAGER_PRIMARY = [
  "properties",
  "applications",
  "residents",
  "calendar",
  "documents",
] as const;

export const NATIVE_BOTTOM_NAV_RESIDENT_PRIMARY = ["dashboard", "lease", "payments", "documents"] as const;

export const NATIVE_BOTTOM_NAV_ADMIN_PRIMARY = ["dashboard", "properties", "axis-users", "events"] as const;

function primaryOrderFor(kind?: PortalDefinition["kind"]): readonly string[] {
  switch (kind) {
    case "pro":
    case "manager":
      return NATIVE_BOTTOM_NAV_PRO_MANAGER_PRIMARY;
    case "resident":
      return NATIVE_BOTTOM_NAV_RESIDENT_PRIMARY;
    case "admin":
      return NATIVE_BOTTOM_NAV_ADMIN_PRIMARY;
    default:
      return [];
  }
}

/**
 * Splits registry sections into the fixed native bar (`primary`, curated per role
 * above) and everything else (`overflow`, shown only in the swipe-up More sheet).
 */
export function splitNativeBottomNavItems<T extends { section: string }>(
  items: T[],
  kind?: PortalDefinition["kind"],
): { primary: T[]; overflow: T[] } {
  const ordered = orderNativeBottomNavItems(items, kind);
  const primaryOrder = primaryOrderFor(kind);
  if (primaryOrder.length === 0) return { primary: ordered, overflow: [] };

  const bySection = new Map(ordered.map((item) => [item.section, item]));
  const primary = primaryOrder
    .map((section) => bySection.get(section))
    .filter((item): item is T => Boolean(item));
  const primarySections = new Set(primary.map((item) => item.section));
  const overflow = ordered.filter((item) => !primarySections.has(item.section));
  return { primary, overflow };
}

/** @deprecated Use splitNativeBottomNavItems — kept for tests. */
export function pickNativeBottomNavItems<T extends { section: string }>(
  items: T[],
  kind?: PortalDefinition["kind"],
): T[] {
  return orderNativeBottomNavItems(items, kind);
}
