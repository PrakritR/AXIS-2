/**
 * Demo-only address books for portal compose: each role only sees contacts linked to their portfolio.
 * Replace with Supabase queries when messaging is wired up.
 */

export type InboxContactRole = "manager" | "resident" | "owner";

export type InboxScopedContact = {
  id: string;
  name: string;
  email: string;
  role: InboxContactRole;
};

/** Resident demo: building manager + property owner for their unit only. */
export const RESIDENT_INBOX_CONTACTS: InboxScopedContact[] = [
  { id: "res-mgr-1", name: "Morgan Blake (property manager)", email: "morgan@axis.demo", role: "manager" },
  { id: "res-mgr-2", name: "Alex Chen (assistant manager)", email: "alex.chen@axis.demo", role: "manager" },
  { id: "res-own-1", name: "Harbor Holdings LLC (owner)", email: "harbor.owner@example.com", role: "owner" },
];

/** Manager demo: residents and owners tied to their buildings. */
export const MANAGER_INBOX_CONTACTS: InboxScopedContact[] = [
  { id: "mgr-res-1", name: "Alex Chen", email: "alex.chen@example.com", role: "resident" },
  { id: "mgr-res-2", name: "Sam Rivera", email: "sam.rivera@example.com", role: "resident" },
  { id: "mgr-res-3", name: "Jordan Lee", email: "jordan.lee@example.com", role: "resident" },
  { id: "mgr-own-1", name: "Harbor Holdings LLC", email: "harbor.owner@example.com", role: "owner" },
  { id: "mgr-own-2", name: "Bayview Capital", email: "bayview.owner@example.com", role: "owner" },
];

/** Owner demo: managers on their account + residents in linked units. */
export const OWNER_INBOX_CONTACTS: InboxScopedContact[] = [
  { id: "own-mgr-1", name: "Morgan Blake", email: "morgan@axis.demo", role: "manager" },
  { id: "own-mgr-2", name: "Riley Park", email: "riley@axis.demo", role: "manager" },
  { id: "own-res-1", name: "Alex Chen", email: "alex.chen@example.com", role: "resident" },
  { id: "own-res-2", name: "Sam Rivera", email: "sam.rivera@example.com", role: "resident" },
];

export function contactsForPortal(portal: "resident" | "manager" | "owner"): InboxScopedContact[] {
  switch (portal) {
    case "resident":
      return RESIDENT_INBOX_CONTACTS;
    case "manager":
      return MANAGER_INBOX_CONTACTS;
    case "owner":
      return OWNER_INBOX_CONTACTS;
    default:
      return [];
  }
}
