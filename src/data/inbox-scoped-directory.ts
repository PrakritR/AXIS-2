/**
 * Portal compose address books. Expand when messaging is backed by real relationships.
 */

export type InboxContactRole = "manager" | "resident" | "owner";

export type InboxScopedContact = {
  id: string;
  name: string;
  email: string;
  role: InboxContactRole;
};

/** Axis partner inbox (admin). */
export const PRIMARY_AXIS_ADMIN_EMAIL = "prakritramachandran@gmail.com";

export const PRIMARY_AXIS_ADMIN_LABEL = "Axis Housing admin";

/** UI buckets — how the compose modal groups recipients. */
export type InboxRecipientCategory = "admin" | "management" | "resident";

/** Which address-book roles appear under Management / Resident for each portal. */
export function rolesForRecipientCategory(
  portal: "resident" | "manager" | "owner",
  category: InboxRecipientCategory,
): InboxContactRole[] {
  if (category === "admin") return [];
  if (portal === "manager") {
    if (category === "management") return ["owner"];
    return ["resident"];
  }
  if (portal === "resident") {
    /* Tenants: staff + landlords under Management; household peers under Resident. */
    if (category === "management") return ["manager", "owner"];
    return ["resident"];
  }
  /* owner portal */
  if (category === "management") return ["manager"];
  return ["resident"];
}

export function categoryForContactRole(
  portal: "resident" | "manager" | "owner",
  role: InboxContactRole,
): InboxRecipientCategory {
  if (portal === "resident") {
    if (role === "resident") return "resident";
    return "management";
  }
  if (portal === "manager") {
    if (role === "owner") return "management";
    return "resident";
  }
  if (role === "manager") return "management";
  return "resident";
}

function contactsVisibleInPortal(portal: "resident" | "manager" | "owner", list: InboxScopedContact[]) {
  const roles = new Set<InboxContactRole>([
    ...rolesForRecipientCategory(portal, "management"),
    ...rolesForRecipientCategory(portal, "resident"),
  ]);
  return list.filter((c) => roles.has(c.role));
}

export function contactsForPortal(
  portal: "resident" | "manager" | "owner",
  liveContacts: InboxScopedContact[] = [],
): InboxScopedContact[] {
  return contactsVisibleInPortal(portal, liveContacts);
}

export function broadcastStubForCategory(category: InboxRecipientCategory): { label: string; email: string } {
  if (category === "admin") {
    return { label: `All admins (${PRIMARY_AXIS_ADMIN_LABEL})`, email: PRIMARY_AXIS_ADMIN_EMAIL };
  }
  if (category === "management") {
    return { label: "All management", email: "broadcast-management@axis.local" };
  }
  return { label: "All residents", email: "broadcast-residents@axis.local" };
}
