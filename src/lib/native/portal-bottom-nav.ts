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
  "leases",
  "residents",
  "payments",
  "services",
  "inbox",
  "relationships",
  "promotion",
  "financials",
  "documents",
  "bugs-feedback",
] as const;

/**
 * Resident footer order — mirrors resident portal registries (Settings omitted; pinned last).
 * Keep in sync with `src/lib/portals/resident-sections.ts`.
 */
export const NATIVE_BOTTOM_NAV_RESIDENT_ORDER = [
  "dashboard",
  "applications",
  "lease",
  "payments",
  "move-in",
  "services",
  "inbox",
  "documents",
] as const;

/**
 * Vendor footer order — mirrors `vendorPortal.sections` (Settings/profile omitted; pinned last).
 * Keep in sync with `src/lib/portals/vendor.ts`.
 */
export const NATIVE_BOTTOM_NAV_VENDOR_ORDER = [
  "dashboard",
  "work-orders",
  "calendar",
  "inbox",
  "financials",
  "payments",
  "documents",
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
 * via the swipe-up "More" sheet (which now lists every section, primary or not —
 * see `moreSheetItems` in portal-sidebar.tsx) and/or nested inside the most
 * relevant primary tab's own page (Promotion + Co-managers inside Properties;
 * Feedback inside Profile/Settings — see portal-settings-extras.tsx and
 * manager-properties.tsx). Keep in sync with `src/lib/platform/parity.ts`.
 */
export const NATIVE_BOTTOM_NAV_PRO_MANAGER_PRIMARY = [
  "properties",
  "calendar",
  "residents",
  "documents",
  "inbox",
] as const;

export const NATIVE_BOTTOM_NAV_RESIDENT_PRE_APPLICATION_PRIMARY = ["applications"] as const;

export const NATIVE_BOTTOM_NAV_RESIDENT_PRIMARY = [
  "applications",
  "lease",
  "move-in",
  "services",
  "payments",
  "inbox",
] as const;

export const NATIVE_BOTTOM_NAV_ADMIN_PRIMARY = ["dashboard", "properties", "axis-users", "events"] as const;

export const NATIVE_BOTTOM_NAV_VENDOR_PRIMARY = ["work-orders", "calendar", "inbox", "payments"] as const;

/**
 * Every role gets the fixed native bottom bar — Dashboard and Settings are
 * reached via the shared `PortalMobileNavBar` (back arrow + profile menu)
 * instead of a bar slot.
 */
export function nativeBottomBarEnabledForKind(_kind?: PortalDefinition["kind"]): boolean {
  return true;
}

/**
 * Whether the fixed bar also gets a trailing "More" tab that opens the full
 * section sheet. Kinds whose curated primary set — plus the shared back
 * arrow (Dashboard) and profile menu (Settings) — already reaches every
 * section don't need one. Vendor now has 7 sections — Documents is reachable via
 * the More sheet alongside the 4 primary tabs + back + profile.
 */
export function nativeBottomNavShowMoreTab(
  kind?: PortalDefinition["kind"],
  items?: { section: string }[],
): boolean {
  if (kind === "resident" && items) {
    const navSections = items.filter((item) => item.section !== "profile").map((item) => item.section);
    if (navSections.length === 1 && navSections[0] === "applications") return false;
  }
  return kind === "pro" || kind === "manager" || kind === "resident" || kind === "vendor";
}

function primaryOrderFor(
  kind?: PortalDefinition["kind"],
  items?: { section: string }[],
): readonly string[] {
  if (kind === "resident" && items) {
    const navSections = new Set(items.filter((item) => item.section !== "profile").map((item) => item.section));
    if (navSections.size === 1 && navSections.has("applications")) {
      return NATIVE_BOTTOM_NAV_RESIDENT_PRE_APPLICATION_PRIMARY;
    }
  }
  switch (kind) {
    case "pro":
    case "manager":
      return NATIVE_BOTTOM_NAV_PRO_MANAGER_PRIMARY;
    case "resident":
      return NATIVE_BOTTOM_NAV_RESIDENT_PRIMARY;
    case "admin":
      return NATIVE_BOTTOM_NAV_ADMIN_PRIMARY;
    case "vendor":
      return NATIVE_BOTTOM_NAV_VENDOR_PRIMARY;
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
  const primaryOrder = primaryOrderFor(kind, items);
  // Fail closed: an unrecognized role with no curated primary set must not dump
  // every section onto the fixed bar — everything goes to the More sheet instead.
  if (primaryOrder.length === 0) return { primary: [], overflow: ordered };

  const bySection = new Map(ordered.map((item) => [item.section, item]));
  const primary = primaryOrder
    .map((section) => bySection.get(section))
    .filter((item): item is T => Boolean(item));
  const primarySections = new Set(primary.map((item) => item.section));
  // Settings is always reached via the mobile profile menu, never the bar or More sheet.
  const overflow = ordered.filter(
    (item) =>
      !primarySections.has(item.section) &&
      item.section !== SETTINGS_SECTION &&
      (kind === "admin" || item.section !== "bugs-feedback"),
  );
  return { primary, overflow };
}

/** @deprecated Use splitNativeBottomNavItems — kept for tests. */
export function pickNativeBottomNavItems<T extends { section: string }>(
  items: T[],
  kind?: PortalDefinition["kind"],
): T[] {
  return orderNativeBottomNavItems(items, kind);
}
