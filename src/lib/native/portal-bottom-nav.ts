import type { PortalDefinition } from "@/lib/portal-types";

/** Settings tab — always pinned to the end of the native bottom bar when shown in primary strip. */
const SETTINGS_SECTION = "profile";

/** Max tabs in the native bottom strip before overflow moves to the More sheet. */
export const NATIVE_BOTTOM_NAV_PRIMARY_LIMIT = 5;

/** @deprecated Use {@link NATIVE_BOTTOM_NAV_PRIMARY_LIMIT}. */
export const NATIVE_BOTTOM_NAV_SLOT_LIMIT = NATIVE_BOTTOM_NAV_PRIMARY_LIMIT;

/**
 * Native bottom bar order — mirrors portal registry order (same as web sidebar).
 * Only safety-pins Settings to the end when it is not already last.
 */
export function orderNativeBottomNavItems<T extends { section: string }>(
  items: T[],
  _kind?: PortalDefinition["kind"],
): T[] {
  if (items.length === 0) return [];

  const last = items[items.length - 1];
  if (last?.section === SETTINGS_SECTION) return [...items];

  const settings = items.find((entry) => entry.section === SETTINGS_SECTION);
  if (!settings) return [...items];

  return [...items.filter((entry) => entry.section !== SETTINGS_SECTION), settings];
}

/** Primary strip tabs + overflow for the More sheet. Settings stays in primary when possible. */
export function splitNativeBottomNavItems<T extends { section: string }>(
  items: T[],
  kind?: PortalDefinition["kind"],
): { primary: T[]; overflow: T[] } {
  const ordered = orderNativeBottomNavItems(items, kind);
  const settings = ordered.find((entry) => entry.section === SETTINGS_SECTION);
  const withoutSettings = ordered.filter((entry) => entry.section !== SETTINGS_SECTION);

  const primaryBody = withoutSettings.slice(0, NATIVE_BOTTOM_NAV_PRIMARY_LIMIT);
  const overflow = withoutSettings.slice(NATIVE_BOTTOM_NAV_PRIMARY_LIMIT);

  if (settings) {
    if (primaryBody.length < NATIVE_BOTTOM_NAV_PRIMARY_LIMIT) {
      primaryBody.push(settings);
    } else {
      overflow.push(settings);
    }
  }

  return { primary: primaryBody, overflow };
}

/** @deprecated Use splitNativeBottomNavItems — kept for tests. */
export function pickNativeBottomNavItems<T extends { section: string }>(
  items: T[],
  kind?: PortalDefinition["kind"],
): T[] {
  return orderNativeBottomNavItems(items, kind);
}
