import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboxScopedContact } from "@/data/inbox-scoped-directory";
import { PRIMARY_ADMIN_EMAIL } from "@/lib/auth/primary-admin";
import { managerOwnsResident } from "@/lib/auth/resident-relationship";

/**
 * Server-side recipient scoping for the portal inbox compose flow.
 *
 * The compose UI already hides out-of-scope people, but the UI is not a security
 * boundary. These helpers are the authoritative gate: they decide, per sender
 * role, exactly which recipients a message may be delivered to. Both the
 * eligible-contacts query (what the picker lists) and the send endpoints call
 * into this module so the two can never drift.
 *
 * Rules (non-admin senders):
 *  - Resident sender  → may message ONLY the managers/owners tied to their own
 *    listing(s)/lease(s), plus those managers' linked co-managers, plus Axis
 *    admin ops. Never other residents, never arbitrary managers.
 *  - Manager sender   → may message ONLY the residents on their own properties,
 *    plus their own linked co-managers, plus Axis admin ops. Never arbitrary
 *    residents, never unlinked managers.
 *  - Admin sender     → unrestricted (unchanged).
 */

const ADMIN_EMAIL = PRIMARY_ADMIN_EMAIL.trim().toLowerCase();

export type InboxScopeSender = {
  id: string;
  email: string;
  role: string | null;
  isAdmin: boolean;
};

export type InboxScopeRecipient = { email: string; userId: string | null };

function isManagerRole(role: string | null): boolean {
  const r = String(role ?? "").trim().toLowerCase();
  return r === "manager" || r === "owner" || r === "pro";
}

/** Emails of co-managers linked to any of the given manager ids (via pro relationships). */
async function coManagerEmailsForManagers(
  db: SupabaseClient,
  managerIds: string[],
): Promise<Set<string>> {
  const emails = new Set<string>();
  if (managerIds.length === 0) return emails;
  const { data } = await db
    .from("portal_pro_relationship_records")
    .select("related_email")
    .in("manager_user_id", managerIds);
  for (const row of data ?? []) {
    const email = String(row.related_email ?? "").trim().toLowerCase();
    if (email) emails.add(email);
  }
  return emails;
}

/** Manager user ids that own the given resident (applications / charges / leases). */
async function managerIdsOwningResident(db: SupabaseClient, residentEmail: string): Promise<string[]> {
  const email = residentEmail.trim().toLowerCase();
  if (!email) return [];
  const ids = new Set<string>();

  const { data: apps } = await db
    .from("manager_application_records")
    .select("manager_user_id, row_data")
    .eq("resident_email", email);
  for (const row of apps ?? []) {
    const rowData = (row.row_data ?? {}) as Record<string, unknown>;
    if (rowData.bucket !== "approved") continue;
    const id = String(row.manager_user_id ?? "").trim();
    if (id) ids.add(id);
  }

  for (const table of ["portal_household_charge_records", "portal_lease_pipeline_records"] as const) {
    const { data } = await db.from(table).select("manager_user_id").eq("resident_email", email);
    for (const row of data ?? []) {
      const id = String(row.manager_user_id ?? "").trim();
      if (id) ids.add(id);
    }
  }

  return [...ids];
}

function partition<T>(items: T[], keep: boolean[]): { allowed: T[]; blocked: T[] } {
  const allowed: T[] = [];
  const blocked: T[] = [];
  items.forEach((item, index) => {
    if (keep[index]) allowed.push(item);
    else blocked.push(item);
  });
  return { allowed, blocked };
}

/**
 * Split recipients into those the sender is authorized to message and those they
 * are not. Admin ops (PRIMARY_ADMIN_EMAIL) is always allowed. Defaults closed.
 */
export async function filterRecipientsBySenderScope<T extends InboxScopeRecipient>(
  db: SupabaseClient,
  sender: InboxScopeSender,
  recipients: T[],
): Promise<{ allowed: T[]; blocked: T[] }> {
  if (recipients.length === 0) return { allowed: [], blocked: [] };
  if (sender.isAdmin) return { allowed: recipients, blocked: [] };

  const senderEmail = sender.email.trim().toLowerCase();

  if (isManagerRole(sender.role)) {
    const coManagers = await coManagerEmailsForManagers(db, [sender.id]);
    const keep = await Promise.all(
      recipients.map(async (recipient) => {
        const email = recipient.email.trim().toLowerCase();
        if (!email) return false;
        if (email === ADMIN_EMAIL) return true;
        if (coManagers.has(email)) return true;
        return managerOwnsResident(db, sender.id, {
          email,
          residentUserId: recipient.userId ?? undefined,
        });
      }),
    );
    return partition(recipients, keep);
  }

  // Resident (and any other non-staff) sender.
  const managerIds = await managerIdsOwningResident(db, senderEmail);
  const managerIdSet = new Set(managerIds);
  const allowedEmails = await coManagerEmailsForManagers(db, managerIds);
  if (managerIds.length > 0) {
    const { data } = await db.from("profiles").select("id, email").in("id", managerIds);
    for (const row of data ?? []) {
      const email = String(row.email ?? "").trim().toLowerCase();
      if (email) allowedEmails.add(email);
    }
  }
  const keep = recipients.map((recipient) => {
    const email = recipient.email.trim().toLowerCase();
    if (email === ADMIN_EMAIL) return true;
    if (email && allowedEmails.has(email)) return true;
    if (recipient.userId && managerIdSet.has(recipient.userId)) return true;
    return false;
  });
  return partition(recipients, keep);
}

/**
 * The individual contacts a sender may pick in the compose modal, scoped to their
 * role. Backs the eligible-contacts API so residents can select their own
 * manager(s) and managers can select their own residents/co-managers.
 */
export async function listEligibleInboxContacts(
  db: SupabaseClient,
  sender: InboxScopeSender,
): Promise<InboxScopedContact[]> {
  const senderEmail = sender.email.trim().toLowerCase();
  const out: InboxScopedContact[] = [];
  const seen = new Set<string>();

  const push = (contact: InboxScopedContact) => {
    const key = contact.email.trim().toLowerCase();
    if (!key || key === senderEmail || key === ADMIN_EMAIL || seen.has(key)) return;
    seen.add(key);
    out.push(contact);
  };

  if (isManagerRole(sender.role) || sender.isAdmin) {
    // Own approved residents.
    const { data: apps } = await db
      .from("manager_application_records")
      .select("id, resident_email, row_data")
      .eq("manager_user_id", sender.id);
    for (const row of apps ?? []) {
      const rowData = (row.row_data ?? {}) as Record<string, unknown>;
      if (rowData.bucket !== "approved") continue;
      const email = String(row.resident_email ?? rowData.email ?? "").trim();
      if (!email) continue;
      push({
        id: `res-${row.id}`,
        name: String(rowData.name ?? rowData.residentName ?? "").trim() || email,
        email,
        role: "resident",
        propertyLabel: String(rowData.property ?? "").trim() || undefined,
        propertyId:
          String(rowData.assignedPropertyId ?? rowData.propertyId ?? "").trim() || undefined,
      });
    }
    // Own linked co-managers.
    await pushCoManagers(db, [sender.id], push);
    return out;
  }

  // Resident sender → their own manager(s) plus those managers' co-managers.
  const managerIds = await managerIdsOwningResident(db, senderEmail);
  if (managerIds.length > 0) {
    const { data: managers } = await db
      .from("profiles")
      .select("id, email, full_name")
      .in("id", managerIds);
    for (const row of managers ?? []) {
      const email = String(row.email ?? "").trim();
      if (!email) continue;
      push({
        id: `mgr-${row.id}`,
        name: String(row.full_name ?? "").trim() || email,
        email,
        role: "manager",
      });
    }
    await pushCoManagers(db, managerIds, push);
  }
  return out;
}

async function pushCoManagers(
  db: SupabaseClient,
  managerIds: string[],
  push: (contact: InboxScopedContact) => void,
): Promise<void> {
  if (managerIds.length === 0) return;
  const { data } = await db
    .from("portal_pro_relationship_records")
    .select("id, related_user_id, related_email, row_data")
    .in("manager_user_id", managerIds);
  for (const row of data ?? []) {
    const email = String(row.related_email ?? "").trim();
    if (!email) continue;
    const rowData = (row.row_data ?? {}) as Record<string, unknown>;
    const name =
      String(rowData.linkedDisplayName ?? rowData.displayName ?? rowData.name ?? "").trim() || email;
    push({
      id: `rel-${row.id}`,
      name,
      email,
      role: "manager",
    });
  }
}
