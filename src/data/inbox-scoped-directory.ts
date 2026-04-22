/**
 * Portal compose address books: empty until messaging is backed by real relationships in the database.
 */

export type InboxContactRole = "manager" | "resident" | "owner";

export type InboxScopedContact = {
  id: string;
  name: string;
  email: string;
  role: InboxContactRole;
};

export function contactsForPortal(_portal: "resident" | "manager" | "owner"): InboxScopedContact[] {
  return [];
}
