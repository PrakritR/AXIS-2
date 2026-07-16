import type { PortalKind } from "@/lib/portal-types";

/**
 * Desktop sidebar grouping — a pure presentation overlay on top of the flat
 * portal registries. Section ids are unchanged, so routes, render handlers, and
 * platform-parity tests are untouched; this only decides how the desktop sidebar
 * buckets sections under headings.
 *
 * `label: null` renders the items with no heading (Home row, trailing Settings).
 * `profile` (Settings) is the sole member of the trailing "account" group for
 * manager/pro/resident/vendor, so `PortalSidebar`'s `mt-auto` pins it to the
 * bottom. Admin Feedback (`bugs-feedback`) is a standalone Operations item;
 * manager/resident/vendor feedback stays inside Settings (embedded panel).
 */
export type NavGroupConfig = { id: string; label: string | null; sections: string[] };

/** Sections never rendered in the desktop sidebar for non-admin portals (Settings stays in account group). */
export const SIDEBAR_EXCLUDED_SECTIONS = new Set<string>(["profile", "bugs-feedback"]);

/**
 * Feedback is embedded inside Settings for manager/resident/vendor. Admin has a
 * dedicated Feedback sidebar entry instead.
 */
export function isHiddenFromMobileNav(kind: PortalKind, section: string): boolean {
  if (section === "bugs-feedback") return kind !== "admin";
  return false;
}

const PRO_GROUPS: NavGroupConfig[] = [
  { id: "home", label: null, sections: ["dashboard"] },
  { id: "leasing", label: "Leasing", sections: ["properties", "calendar", "applications", "leases"] },
  { id: "tenancy", label: "Tenancy", sections: ["residents", "payments"] },
  { id: "operations", label: "Operations", sections: ["services", "communication"] },
  { id: "marketing", label: "Marketing", sections: ["promotion"] },
  { id: "team", label: "Team", sections: ["relationships"] },
  { id: "finances", label: "Finances", sections: ["financials", "documents"] },
  { id: "account", label: null, sections: ["profile"] },
];

const ADMIN_GROUPS: NavGroupConfig[] = [
  { id: "home", label: null, sections: ["dashboard"] },
  { id: "portfolio", label: "Portfolio", sections: ["properties"] },
  { id: "people", label: "People", sections: ["axis-users"] },
  { id: "operations", label: "Operations", sections: ["events", "inbox", "bugs-feedback"] },
  { id: "account", label: null, sections: ["profile"] },
];

const RESIDENT_GROUPS: NavGroupConfig[] = [
  { id: "home", label: null, sections: ["dashboard", "applications"] },
  { id: "my-home", label: "My home", sections: ["lease", "move-in", "services"] },
  { id: "finances", label: "Finances", sections: ["payments", "documents"] },
  { id: "messages", label: "Messages", sections: ["communication"] },
  { id: "account", label: null, sections: ["profile"] },
];

const VENDOR_GROUPS: NavGroupConfig[] = [
  { id: "home", label: null, sections: ["dashboard"] },
  { id: "work", label: "Work", sections: ["work-orders", "calendar"] },
  { id: "operations", label: "Operations", sections: ["communication"] },
  { id: "finances", label: "Finances", sections: ["financials", "payments", "documents"] },
  { id: "account", label: null, sections: ["profile"] },
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
  const byId = new Map(items.map((i) => [i.section, i] as const));

  // Application phase: only Application + Settings — keep Application at the top row
  // and pin Settings to the bottom (account group gets mt-auto in PortalSidebar).
  if (kind === "resident" && items.length === 2) {
    const applications = byId.get("applications");
    const profile = byId.get("profile");
    if (applications && profile) {
      return [
        { id: "home", label: null, items: [applications] },
        { id: "account", label: null, items: [profile] },
      ];
    }
  }

  // Unknown kind (shouldn't happen for a valid PortalKind) → empty config, so every
  // item falls through to the trailing leftover group below; nothing is dropped.
  const config = PORTAL_NAV_GROUPS[kind] ?? [];
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
