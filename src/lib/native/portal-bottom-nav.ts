import type { PortalDefinition } from "@/lib/portal-types";

/** Preferred tab order in the native bottom bar (all sections are shown; bar scrolls horizontally). */
const NATIVE_BOTTOM_NAV_ORDER: Partial<Record<PortalDefinition["kind"], string[]>> = {
  resident: ["dashboard", "applications", "payments", "inbox", "documents", "profile"],
  pro: ["dashboard", "properties", "applications", "inbox", "leases", "calendar", "documents", "profile"],
  manager: ["dashboard", "properties", "applications", "inbox", "leases", "calendar", "documents", "profile"],
  admin: [
    "dashboard",
    "onboard",
    "properties",
    "axis-users",
    "leases",
    "events",
    "inbox",
    "bugs-feedback",
    "profile",
  ],
};

/** @deprecated Primary slot limit — native bar now shows all tabs in a horizontal scroll strip. */
export const NATIVE_BOTTOM_NAV_SLOT_LIMIT = 4;

/** All nav items in portal-preferred order for the native bottom scroll strip. */
export function orderNativeBottomNavItems<T extends { section: string }>(
  items: T[],
  kind: PortalDefinition["kind"],
): T[] {
  const preferred = NATIVE_BOTTOM_NAV_ORDER[kind] ?? [];
  const ordered: T[] = [];
  const used = new Set<string>();

  for (const id of preferred) {
    const item = items.find((entry) => entry.section === id);
    if (item) {
      ordered.push(item);
      used.add(item.section);
    }
  }

  for (const item of items) {
    if (!used.has(item.section)) ordered.push(item);
  }

  return ordered;
}

/** @deprecated Use orderNativeBottomNavItems — kept for tests and gradual migration. */
export function splitNativeBottomNavItems<T extends { section: string }>(
  items: T[],
  kind: PortalDefinition["kind"],
): { primary: T[]; overflow: T[] } {
  const ordered = orderNativeBottomNavItems(items, kind);
  return { primary: ordered, overflow: [] };
}

/** @deprecated Use orderNativeBottomNavItems — kept for tests. */
export function pickNativeBottomNavItems<T extends { section: string }>(
  items: T[],
  kind: PortalDefinition["kind"],
): T[] {
  return orderNativeBottomNavItems(items, kind);
}
