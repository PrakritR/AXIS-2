import type { PortalKind } from "@/lib/portal-types";

/**
 * Desktop sidebar grouping — a pure presentation overlay on top of the flat
 * portal registries. Section ids are unchanged, so routes, render handlers, and
 * platform-parity tests are untouched; this only decides how the desktop sidebar
 * buckets sections under headings.
 *
 * `label: null` renders the items with no heading (Home row, trailing Settings).
 * `profile` (Settings) is the sole member of the trailing "account" group for
 * manager/pro and resident, so `PortalSidebar`'s `mt-auto` on the first
 * trailing group pins it alone to the sidebar's bottom corner. Feedback
 * (`bugs-feedback`) is left out of the manager/pro and resident configs on
 * purpose — it's reachable from inside the Settings page instead (see
 * `PortalBugFeedbackPanel`'s `embedded` mode), not as its own sidebar entry.
 * The route/section itself is untouched so it stays reachable directly. Admin
 * is out of scope for that change and keeps Feedback as its own sidebar item.
 */
export type NavGroupConfig = { id: string; label: string | null; sections: string[] };

/** Sections never rendered in the desktop sidebar (surfaced in the account menu or inside Settings instead). */
export const SIDEBAR_EXCLUDED_SECTIONS = new Set<string>(["profile", "bugs-feedback"]);

/**
 * Feedback is embedded inside the Settings page (see `PortalBugFeedbackPanel`'s
 * `embedded` mode) for pro/manager and resident, matching the desktop sidebar
 * exclusion above — so it shouldn't appear as a separate destination in the
 * mobile top nav strip or the native "More" sheet either. Admin keeps Feedback
 * as a first-class destination everywhere (it's excluded from this check).
 */
export function isHiddenFromMobileNav(kind: PortalKind, section: string): boolean {
  return section === "bugs-feedback" && kind !== "admin";
}

const PRO_GROUPS: NavGroupConfig[] = [
  { id: "home", label: null, sections: ["dashboard"] },
  { id: "portfolio", label: "Portfolio", sections: ["properties", "leases"] },
  { id: "leasing", label: "Leasing", sections: ["applications", "residents"] },
  { id: "finances", label: "Finances", sections: ["payments", "financials", "documents"] },
  { id: "operations", label: "Operations", sections: ["calendar", "services", "inbox"] },
  { id: "marketing", label: "Marketing", sections: ["promotion"] },
  { id: "team", label: "Team", sections: ["relationships"] },
  { id: "account", label: null, sections: ["profile"] },
];

const ADMIN_GROUPS: NavGroupConfig[] = [
  { id: "home", label: null, sections: ["dashboard"] },
  { id: "portfolio", label: "Portfolio", sections: ["properties", "leases"] },
  { id: "people", label: "People", sections: ["axis-users"] },
  { id: "operations", label: "Operations", sections: ["events", "inbox"] },
  { id: "account", label: null, sections: ["bugs-feedback"] },
];

const RESIDENT_GROUPS: NavGroupConfig[] = [
  { id: "home", label: null, sections: ["dashboard"] },
  { id: "my-home", label: "My home", sections: ["lease", "move-in", "services"] },
  { id: "finances", label: "Finances", sections: ["payments", "documents"] },
  { id: "messages", label: "Messages", sections: ["inbox"] },
  { id: "account", label: null, sections: ["profile"] },
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
