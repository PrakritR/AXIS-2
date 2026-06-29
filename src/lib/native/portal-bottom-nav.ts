import type { PortalDefinition } from "@/lib/portal-types";

/** Primary tabs in the native bottom bar — everything else lives in More. */
const NATIVE_BOTTOM_NAV_ORDER: Partial<Record<PortalDefinition["kind"], string[]>> = {
  resident: ["dashboard", "applications", "payments", "inbox"],
  pro: ["dashboard", "properties", "applications", "inbox"],
  manager: ["dashboard", "properties", "applications", "inbox"],
  admin: ["dashboard", "leases", "residents", "inbox"],
};

export const NATIVE_BOTTOM_NAV_SLOT_LIMIT = 4;

export function splitNativeBottomNavItems<T extends { section: string }>(
  items: T[],
  kind: PortalDefinition["kind"],
): { primary: T[]; overflow: T[] } {
  const preferred = NATIVE_BOTTOM_NAV_ORDER[kind] ?? [];
  const picked: T[] = [];

  for (const id of preferred) {
    const item = items.find((entry) => entry.section === id);
    if (item) picked.push(item);
  }

  for (const item of items) {
    if (picked.length >= NATIVE_BOTTOM_NAV_SLOT_LIMIT) break;
    if (picked.some((entry) => entry.section === item.section)) continue;
    picked.push(item);
  }

  const primary = picked.slice(0, NATIVE_BOTTOM_NAV_SLOT_LIMIT);
  const primaryIds = new Set(primary.map((entry) => entry.section));
  const overflow = items.filter((entry) => !primaryIds.has(entry.section));

  return { primary, overflow };
}

/** @deprecated Use splitNativeBottomNavItems — kept for tests. */
export function pickNativeBottomNavItems<T extends { section: string }>(
  items: T[],
  kind: PortalDefinition["kind"],
): T[] {
  return splitNativeBottomNavItems(items, kind).primary;
}
