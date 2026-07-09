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

/** Emails of co-managers a manager invited, from the AUTHORITATIVE account_link_invites.
 *
 * Deliberately NOT read from portal_pro_relationship_records: that mirror is
 * client-writable (its related_user_id comes from the request body), so trusting
 * it here would let a manager forge a relationship row and widen their outbound
 * messaging scope to arbitrary users. account_link_invites.invitee_user_id is set
 * server-side at invite creation (Axis-ID lookup), so it cannot be spoofed. */
async function coManagerEmailsForManagers(
  db: SupabaseClient,
  managerIds: string[],
): Promise<Set<string>> {
  const emails = new Set<string>();
  if (managerIds.length === 0) return emails;
  const inviteeIds = await accountLinkCoManagerIdsForManagers(db, managerIds);
  if (inviteeIds.size > 0) {
    const { data: profs } = await db.from("profiles").select("email").in("id", [...inviteeIds]);
    for (const p of profs ?? []) {
      const e = String(p.email ?? "").trim().toLowerCase();
      if (e) emails.add(e);
    }
  }
  return emails;
}

/** Emails of the OWNER manager(s) who granted this co-manager access (accepted links). */
async function ownerEmailsForCoManager(db: SupabaseClient, coManagerId: string): Promise<Set<string>> {
  const emails = new Set<string>();
  const id = coManagerId.trim();
  if (!id) return emails;
  try {
    const { data } = await db
      .from("account_link_invites")
      .select("inviter_user_id")
      .eq("status", "accepted")
      .eq("invitee_user_id", id);
    const ownerIds = [...new Set((data ?? []).map((r) => String(r.inviter_user_id ?? "").trim()).filter(Boolean))];
    if (ownerIds.length > 0) {
      const { data: profs } = await db.from("profiles").select("email").in("id", ownerIds);
      for (const p of profs ?? []) {
        const e = String(p.email ?? "").trim().toLowerCase();
        if (e) emails.add(e);
      }
    }
  } catch {
    /* table may not exist */
  }
  return emails;
}

/** Co-manager auth user ids linked to any of the given manager ids (account links). */
async function accountLinkCoManagerIdsForManagers(
  db: SupabaseClient,
  managerIds: string[],
): Promise<Set<string>> {
  const ids = new Set<string>();
  if (managerIds.length === 0) return ids;
  try {
    const { data } = await db
      .from("account_link_invites")
      .select("invitee_user_id")
      .eq("status", "accepted")
      .in("inviter_user_id", managerIds);
    for (const row of data ?? []) {
      const id = String(row.invitee_user_id ?? "").trim();
      if (id) ids.add(id);
    }
  } catch {
    /* table may not exist */
  }
  return ids;
}

/** Emails of vendors in the given managers' own vendor directory. */
async function vendorEmailsForManagers(
  db: SupabaseClient,
  managerIds: string[],
): Promise<Set<string>> {
  const emails = new Set<string>();
  if (managerIds.length === 0) return emails;
  const { data } = await db
    .from("manager_vendor_records")
    .select("row_data")
    .in("manager_user_id", managerIds);
  for (const row of data ?? []) {
    const rowData = (row.row_data ?? {}) as Record<string, unknown>;
    const email = String(rowData.email ?? "").trim().toLowerCase();
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

/** Manager user ids that invited/own the given vendor (by linked auth user or directory email). */
async function managerIdsOwningVendor(
  db: SupabaseClient,
  vendor: { userId: string; email: string },
): Promise<string[]> {
  const email = vendor.email.trim().toLowerCase();
  const ids = new Set<string>();
  const filter = email
    ? `vendor_user_id.eq.${vendor.userId},row_data->>email.eq.${email}`
    : `vendor_user_id.eq.${vendor.userId}`;
  const { data } = await db
    .from("manager_vendor_records")
    .select("manager_user_id, vendor_user_id, row_data")
    .or(filter);
  for (const row of data ?? []) {
    const id = String(row.manager_user_id ?? "").trim();
    if (id) ids.add(id);
  }
  return [...ids];
}

function isVendorRole(role: string | null): boolean {
  return String(role ?? "").trim().toLowerCase() === "vendor";
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
    // Both directions of a co-manager link: downstream co-managers this manager
    // granted access to, AND the upstream owner(s) who granted THIS manager
    // access (so a co-manager can always reach the owner who linked them).
    const [coManagers, owners, vendors] = await Promise.all([
      coManagerEmailsForManagers(db, [sender.id]),
      ownerEmailsForCoManager(db, sender.id),
      vendorEmailsForManagers(db, [sender.id]),
    ]);
    const keep = await Promise.all(
      recipients.map(async (recipient) => {
        const email = recipient.email.trim().toLowerCase();
        if (!email) return false;
        if (email === ADMIN_EMAIL) return true;
        if (coManagers.has(email)) return true;
        if (owners.has(email)) return true;
        if (vendors.has(email)) return true;
        return managerOwnsResident(db, sender.id, {
          email,
          residentUserId: recipient.userId ?? undefined,
        });
      }),
    );
    return partition(recipients, keep);
  }

  // Vendor sender → may message the manager(s) who invited/own them plus their co-managers.
  if (isVendorRole(sender.role)) {
    const managerIds = await managerIdsOwningVendor(db, { userId: sender.id, email: senderEmail });
    const managerIdSet = new Set(managerIds);
    const coManagerEmails = await coManagerEmailsForManagers(db, managerIds);
    const coManagerIds = await accountLinkCoManagerIdsForManagers(db, managerIds);
    const { data } = managerIds.length > 0 ? await db.from("profiles").select("id, email").in("id", managerIds) : { data: [] };
    const allowedEmails = new Set((data ?? []).map((row) => String(row.email ?? "").trim().toLowerCase()).filter(Boolean));
    if (coManagerIds.size > 0) {
      const { data: coProfiles } = await db.from("profiles").select("id, email").in("id", [...coManagerIds]);
      for (const row of coProfiles ?? []) {
        const email = String(row.email ?? "").trim().toLowerCase();
        if (email) allowedEmails.add(email);
      }
    }
    const keep = recipients.map((recipient) => {
      const email = recipient.email.trim().toLowerCase();
      if (email === ADMIN_EMAIL) return true;
      if (email && allowedEmails.has(email)) return true;
      if (email && coManagerEmails.has(email)) return true;
      if (recipient.userId && managerIdSet.has(recipient.userId)) return true;
      if (recipient.userId && coManagerIds.has(recipient.userId)) return true;
      return false;
    });
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

  // Vendor sender → the manager(s) who invited/own them.
  if (isVendorRole(sender.role)) {
    const vendorManagerIds = await managerIdsOwningVendor(db, { userId: sender.id, email: senderEmail });
    if (vendorManagerIds.length > 0) {
      const { data: managers } = await db
        .from("profiles")
        .select("id, email, full_name")
        .in("id", vendorManagerIds);
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
    }
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
  // Authoritative source (account_link_invites), matching coManagerEmailsForManagers
  // — the contact picker must not diverge from the send-scope gate, and must not
  // read the client-writable relationship mirror.
  const inviteeIds = await accountLinkCoManagerIdsForManagers(db, managerIds);
  if (inviteeIds.size === 0) return;
  const { data } = await db.from("profiles").select("id, email, full_name").in("id", [...inviteeIds]);
  for (const row of data ?? []) {
    const email = String(row.email ?? "").trim();
    if (!email) continue;
    push({
      id: `cm-${row.id}`,
      name: String(row.full_name ?? "").trim() || email,
      email,
      role: "manager",
    });
  }
}
