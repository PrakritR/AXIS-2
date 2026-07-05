import type { PortalKind } from "@/lib/portal-types";

/**
 * Desktop sidebar grouping — a pure presentation overlay on top of the flat
 * portal registries. Section ids are unchanged, so routes, render handlers, and
 * platform-parity tests are untouched; this only decides how the desktop sidebar
 * buckets sections under headings.
 *
 * `label: null` renders the items with no heading (Home row, trailing Feedback).
 * `profile` is intentionally absent everywhere — it lives in the top-right
 * account menu, not the sidebar.
 */
export type NavGroupConfig = { id: string; label: string | null; sections: string[] };

/** Sections never rendered in the desktop sidebar (surfaced in the account menu instead). */
export const SIDEBAR_EXCLUDED_SECTIONS = new Set<string>(["profile"]);

// Order mirrors the native bottom bar (Dashboard, Properties, Residents, Documents,
// Finances, ..., Settings) — see NATIVE_BOTTOM_NAV_PRO_MANAGER_PRIMARY in
// portal-bottom-nav.ts. Documents and Finances stay separate sidebar items on
// desktop; only the mobile bar combines them into one "Files" tab.
const PRO_GROUPS: NavGroupConfig[] = [
  { id: "home", label: null, sections: ["dashboard"] },
  { id: "properties", label: "Properties", sections: ["properties", "residents", "applications", "leases"] },
  { id: "financials", label: "Financials", sections: ["documents", "financials", "payments"] },
  { id: "operations", label: "Operations", sections: ["calendar", "services", "vendors", "inbox"] },
  { id: "marketing", label: "Marketing", sections: ["promotion"] },
  { id: "team", label: "Team", sections: ["relationships"] },
  { id: "account", label: null, sections: ["bugs-feedback", "profile"] },
];

const ADMIN_GROUPS: NavGroupConfig[] = [
  { id: "home", label: null, sections: ["dashboard"] },
  { id: "properties", label: "Properties", sections: ["properties", "leases"] },
  { id: "operations", label: "Operations", sections: ["events", "inbox"] },
  { id: "people", label: "People", sections: ["axis-users"] },
  { id: "account", label: null, sections: ["bugs-feedback"] },
];

const RESIDENT_GROUPS: NavGroupConfig[] = [
  { id: "home", label: null, sections: ["dashboard"] },
  { id: "living", label: "Living", sections: ["lease", "move-in", "services"] },
  { id: "financials", label: "Financials", sections: ["payments", "documents"] },
  { id: "operations", label: "Operations", sections: ["inbox"] },
  { id: "account", label: null, sections: ["bugs-feedback"] },
];

const VENDOR_GROUPS: NavGroupConfig[] = [
  { id: "home", label: null, sections: ["dashboard"] },
  { id: "work", label: "Work", sections: ["work-orders", "calendar"] },
  { id: "operations", label: "Operations", sections: ["inbox"] },
];

export const PORTAL_NAV_GROUPS: Record<PortalKind, NavGroupConfig[]> = {
  pro: PRO_GROUPS,
  manager: PRO_GROUPS,
  admin: ADMIN_GROUPS,
  resident: RESIDENT_GROUPS,
  vendor: VENDOR_GROUPS,
};

export type GroupedNav<T> = { id: string; label: string | null; items: T[] };

/**
 * Bucket flat nav items into the portal's groups, preserving config order within
 * each group. Items not in any group (and not excluded) fall into a trailing
 * unlabeled group so nothing silently disappears.
 */
export function groupNavItems<T extends { section: string }>(
  kind: PortalKind,
  items: T[],
): GroupedNav<T>[] {
  // Unknown kind (shouldn't happen for a valid PortalKind) → empty config, so every
  // item falls through to the trailing leftover group below; nothing is dropped.
  const config = PORTAL_NAV_GROUPS[kind] ?? [];
  const byId = new Map(items.map((i) => [i.section, i] as const));
  const assigned = new Set<string>();

  const groups: GroupedNav<T>[] = config.map((g) => {
    const groupItems: T[] = [];
    for (const id of g.sections) {
      const item = byId.get(id);
      if (item) {
        groupItems.push(item);
        assigned.add(id);
      }
    }
    return { id: g.id, label: g.label, items: groupItems };
  });

  const leftovers = items.filter((i) => !assigned.has(i.section) && !SIDEBAR_EXCLUDED_SECTIONS.has(i.section));
  if (leftovers.length) groups.push({ id: "more", label: null, items: leftovers });

  return groups.filter((g) => g.items.length > 0);
}
