import type { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { purgeOrphanedCoManagerLinks } from "@/lib/auth/purge-orphaned-co-manager-links";
import { ADMIN_INBOX_SCOPE } from "@/lib/portal-inbox-thread-scope";

type ServiceDb = ReturnType<typeof createSupabaseServiceRoleClient>;

export type PortalAccountIndex = {
  residentEmails: Set<string>;
  residentUserIds: Set<string>;
  managerUserIds: Set<string>;
  managerEmails: Set<string>;
};

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Build sets of valid resident/manager profile ids and emails from Supabase. */
export async function loadPortalAccountIndex(db: ServiceDb): Promise<PortalAccountIndex> {
  async function idsForRole(role: string): Promise<string[]> {
    const { data: pr } = await db.from("profile_roles").select("user_id").eq("role", role);
    const fromRoles = [...new Set((pr ?? []).map((r) => r.user_id))];
    const { data: legacy } = await db.from("profiles").select("id").eq("role", role);
    const fromLegacy = (legacy ?? []).map((p) => p.id);
    return [...new Set([...fromRoles, ...fromLegacy])];
  }

  const [managerIds, residentIds, proIds, ownerIds] = await Promise.all([
    idsForRole("manager"),
    idsForRole("resident"),
    idsForRole("pro"),
    idsForRole("owner"),
  ]);
  const managerUserIds = new Set([...managerIds, ...proIds, ...ownerIds].filter(Boolean));
  const residentUserIds = new Set(residentIds.filter(Boolean));

  const profileIds = [...new Set([...managerUserIds, ...residentUserIds])];
  const residentEmails = new Set<string>();
  const managerEmails = new Set<string>();
  if (profileIds.length > 0) {
    const { data: profiles } = await db.from("profiles").select("id, email, role").in("id", profileIds);
    for (const profile of profiles ?? []) {
      const email = normalizeEmail(profile.email);
      const id = normalizeId(profile.id);
      const role = String(profile.role ?? "").toLowerCase();
      if (id && managerUserIds.has(id) && email) {
        managerEmails.add(email);
      }
      if (id && residentUserIds.has(id)) {
        if (email) residentEmails.add(email);
      }
      if (role === "resident" && email) residentEmails.add(email);
      if (role === "manager" && email) managerEmails.add(email);
    }
  }

  return { residentEmails, residentUserIds, managerUserIds, managerEmails };
}

function residentStillExists(
  record: { resident_email?: unknown; resident_user_id?: unknown; row_data?: unknown },
  index: PortalAccountIndex,
): boolean {
  const email = normalizeEmail(record.resident_email);
  const userId = normalizeId(record.resident_user_id);
  if (userId && index.residentUserIds.has(userId)) return true;
  if (email && index.residentEmails.has(email)) return true;

  const rowData = record.row_data;
  if (rowData && typeof rowData === "object") {
    const nestedEmail = normalizeEmail((rowData as Record<string, unknown>).residentEmail);
    const nestedUserId = normalizeId((rowData as Record<string, unknown>).residentUserId);
    if (nestedUserId && index.residentUserIds.has(nestedUserId)) return true;
    if (nestedEmail && index.residentEmails.has(nestedEmail)) return true;
  }
  return false;
}

function managerStillExists(
  record: { manager_user_id?: unknown; row_data?: unknown },
  index: PortalAccountIndex,
): boolean {
  const managerId = normalizeId(record.manager_user_id);
  if (managerId && index.managerUserIds.has(managerId)) return true;

  const rowData = record.row_data;
  if (rowData && typeof rowData === "object") {
    const nestedId = normalizeId((rowData as Record<string, unknown>).managerUserId);
    if (nestedId && index.managerUserIds.has(nestedId)) return true;
  }
  return false;
}

/** Inbox threads can be owned by a manager or resident; participant_email is only a resident counterparty when owner is a manager. */
export function isOrphanInboxThread(
  record: { participant_email?: unknown; owner_user_id?: unknown; scope?: unknown },
  index: PortalAccountIndex,
): boolean {
  if (record.scope === ADMIN_INBOX_SCOPE) return false;

  const ownerId = normalizeId(record.owner_user_id);
  const email = normalizeEmail(record.participant_email);

  const ownerValid = !ownerId || index.managerUserIds.has(ownerId) || index.residentUserIds.has(ownerId);
  const participantOrphan = Boolean(
    email &&
      ownerId &&
      index.managerUserIds.has(ownerId) &&
      !index.residentEmails.has(email) &&
      !index.managerEmails.has(email),
  );
  const ownerOrphan = Boolean(ownerId && !ownerValid);
  const residentMailboxOrphan = Boolean(!ownerId && email && !index.residentEmails.has(email));

  return ownerOrphan || participantOrphan || residentMailboxOrphan;
}

function isOrphanResidentScopedRecord(
  record: { resident_email?: unknown; resident_user_id?: unknown; manager_user_id?: unknown; row_data?: unknown },
  index: PortalAccountIndex,
): boolean {
  const email = normalizeEmail(record.resident_email);
  const userId = normalizeId(record.resident_user_id);
  const rowData = record.row_data;
  const nestedEmail =
    rowData && typeof rowData === "object"
      ? normalizeEmail((rowData as Record<string, unknown>).residentEmail)
      : "";
  const hasResidentRef = Boolean(email || userId || nestedEmail);
  if (hasResidentRef && !residentStillExists(record, index)) return true;

  const managerId = normalizeId(record.manager_user_id);
  const nestedManagerId =
    rowData && typeof rowData === "object"
      ? normalizeId((rowData as Record<string, unknown>).managerUserId)
      : "";
  const hasManagerRef = Boolean(managerId || nestedManagerId);
  if (hasManagerRef && !managerStillExists(record, index)) return true;

  return false;
}

/**
 * Deletes portal rows whose resident and/or manager no longer exist in profiles.
 * Safe for admin maintenance after account deletion.
 */
export async function purgeOrphanedPortalRecords(db: ServiceDb): Promise<{
  deleted: Record<string, number>;
  purgedEmails: string[];
}> {
  const index = await loadPortalAccountIndex(db);
  const purgedEmails = new Set<string>();
  const deleted: Record<string, number> = {};

  const residentTables = [
    "portal_household_charge_records",
    "portal_recurring_rent_profile_records",
    "portal_lease_pipeline_records",
    "portal_work_order_records",
    "portal_resident_lease_upload_records",
  ] as const;

  for (const table of residentTables) {
    const { data: records } = await db.from(table).select("id, resident_email, resident_user_id, manager_user_id, row_data");
    const orphanIds = (records ?? [])
      .filter((record) => isOrphanResidentScopedRecord(record, index))
      .map((record) => {
        const email = normalizeEmail(record.resident_email);
        if (email) purgedEmails.add(email);
        return record.id as string;
      })
      .filter(Boolean);

    if (orphanIds.length > 0) {
      await db.from(table).delete().in("id", orphanIds);
    }
    deleted[table] = orphanIds.length;
  }

  const { data: applications } = await db
    .from("manager_application_records")
    .select("id, resident_email, manager_user_id, row_data");
  const orphanApplicationIds = (applications ?? [])
    .filter((record) => isOrphanResidentScopedRecord(record, index))
    .map((record) => {
      const email = normalizeEmail(record.resident_email);
      if (email) purgedEmails.add(email);
      return record.id as string;
    })
    .filter(Boolean);

  if (orphanApplicationIds.length > 0) {
    await db.from("manager_application_records").delete().in("id", orphanApplicationIds);
  }
  deleted["manager_application_records"] = orphanApplicationIds.length;

  const { data: inboxRecords } = await db
    .from("portal_inbox_thread_records")
    .select("id, participant_email, owner_user_id, scope");
  const orphanInboxIds = (inboxRecords ?? [])
    .filter((record) => {
      const email = normalizeEmail(record.participant_email);
      const orphan = isOrphanInboxThread(record, index);
      if (orphan && email) purgedEmails.add(email);
      return orphan;
    })
    .map((record) => record.id as string)
    .filter(Boolean);

  if (orphanInboxIds.length > 0) {
    await db.from("portal_inbox_thread_records").delete().in("id", orphanInboxIds);
  }
  deleted["portal_inbox_thread_records"] = orphanInboxIds.length;

  const coManagerCleanup = await purgeOrphanedCoManagerLinks(db);
  deleted.portal_pro_relationship_records =
    (deleted.portal_pro_relationship_records ?? 0) + coManagerCleanup.deleted.portal_pro_relationship_records;
  deleted.account_link_invites =
    (deleted.account_link_invites ?? 0) + coManagerCleanup.deleted.account_link_invites;

  return { deleted, purgedEmails: [...purgedEmails] };
}
