import type { PortalDefinition } from "@/lib/portal-types";

/** Primary tabs shown in the native app bottom bar (replaces the top section hotbar). */
const NATIVE_BOTTOM_NAV_ORDER: Partial<Record<PortalDefinition["kind"], string[]>> = {
  resident: ["dashboard", "applications", "payments", "inbox", "profile"],
  pro: ["dashboard", "properties", "applications", "leases", "profile"],
  manager: ["dashboard", "properties", "applications", "leases", "profile"],
  admin: ["dashboard", "leases", "residents", "inbox", "profile"],
};

export function pickNativeBottomNavItems<T extends { section: string }>(
  items: T[],
  kind: PortalDefinition["kind"],
): T[] {
  const preferred = NATIVE_BOTTOM_NAV_ORDER[kind] ?? [];
  const picked: T[] = [];

  for (const id of preferred) {
    const item = items.find((entry) => entry.section === id);
    if (item) picked.push(item);
  }

  if (picked.length >= 4) return picked.slice(0, 5);

  for (const item of items) {
    if (picked.some((entry) => entry.section === item.section)) continue;
    picked.push(item);
    if (picked.length >= 5) break;
  }

  return picked;
}
