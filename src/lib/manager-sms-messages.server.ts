import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { linkedOwnerScopeForModule } from "@/lib/auth/co-manager-module-scope";
import type {
  ManagerSmsConversationsPayload,
  ManagerSmsMessageRow,
  ManagerSmsResidentConversation,
} from "@/lib/manager-sms-messages";
import {
  buildConversationKey,
  coerceCounterpartyRole,
  conversationPhoneRef,
  deriveCounterpartyRole,
  type SmsCounterpartyRole,
} from "@/lib/sms-conversation-identity";
import {
  clawLeasingAgentPhoneE164,
  isClawSharedLineBridgeEnabled,
  isPlaceholderManagerWorkNumber,
} from "@/lib/claw-leasing-links";
import { normalizeE164 } from "@/lib/twilio";
import { resolveManagerWorkNumber } from "@/lib/twilio-provisioning";

export type { ManagerSmsConversationsPayload, ManagerSmsMessageRow, ManagerSmsResidentConversation };

function phoneKey(raw: string): string {
  return normalizeE164(raw) ?? raw.trim();
}

/**
 * Viewer + owners who granted this user Communication (inbox) co-manager
 * access at the given level ("read" for viewing, "edit" for send/delete).
 */
export async function resolveSmsScopeManagerIds(
  db: SupabaseClient,
  viewerUserId: string,
  level: "read" | "edit" = "read",
): Promise<string[]> {
  const ids = new Set<string>([viewerUserId.trim()].filter(Boolean));
  try {
    const { ownerIds } = await linkedOwnerScopeForModule(db, viewerUserId, "inbox", level);
    for (const id of ownerIds) {
      if (id.trim()) ids.add(id.trim());
    }
  } catch (e) {
    console.error("resolveSmsScopeManagerIds failed", e instanceof Error ? e.message : e);
  }
  return [...ids];
}

/**
 * Hard-delete one conversation's stored texts. There is no soft-delete and no
 * restore, so the SCOPE has to be the conversation identity, not the phone:
 * since conversation identity became explicit, one phone can be two threads
 * (a leasing prospect and a resident) shown as two rows, and a phone-scoped
 * delete would destroy the other role's correspondence as collateral while the
 * confirm dialog named only one thread.
 *
 * `conversationKey` is therefore the primary filter. The phone-variant match
 * survives only for LEGACY rows written before `conversation_key` existed
 * (those cannot be split by role anyway), and as the whole-phone fallback when
 * no key is supplied at all.
 */
export async function deleteManagerSmsConversation(
  db: SupabaseClient,
  args: { managerUserId: string; phone: string; conversationKey?: string | null },
): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const managerUserId = args.managerUserId.trim();
  const phone = phoneKey(args.phone);
  const conversationKey = args.conversationKey?.trim() || "";
  if (!managerUserId || !phone) return { ok: false, error: "invalid_phone" };

  const digits = phone.replace(/\D/g, "");
  const phoneVariants = new Set<string>([phone]);
  if (digits.length >= 10) {
    phoneVariants.add(`+${digits}`);
    // Only US numbers get the +1/last-10 legacy variants — for other country
    // codes, +1 + last-10 digits is a DIFFERENT number that may belong to an
    // unrelated counterparty, and matching it would delete their history.
    if (digits.length === 10 || (digits.length === 11 && digits.startsWith("1"))) {
      const last10 = digits.slice(-10);
      phoneVariants.add(`+1${last10}`);
      phoneVariants.add(last10);
    }
  }

  let deleted = 0;
  const variants = [...phoneVariants];

  const deleteFrom = async (
    table: "manager_sms_messages" | "inbound_sms_log",
    phoneColumn: "resident_phone" | "from_phone",
  ): Promise<{ ok: boolean; count: number; error?: string }> => {
    const run = async (scope: "key" | "legacy" | "phone") => {
      let q = db.from(table).delete().eq("manager_user_id", managerUserId);
      if (scope === "key") q = q.eq("conversation_key", conversationKey);
      // Legacy rows predate the column, so they carry no role and can only be
      // matched by phone — bounded to null keys so a keyed sibling is safe.
      else if (scope === "legacy") q = q.is("conversation_key", null).in(phoneColumn, variants);
      else q = q.in(phoneColumn, variants);
      const { data, error } = await q.select("id");
      return { rows: data?.length ?? 0, error };
    };

    if (!conversationKey) {
      const { rows, error } = await run("phone");
      return error ? { ok: false, count: 0, error: error.message } : { ok: true, count: rows };
    }
    const keyed = await run("key");
    if (keyed.error) return { ok: false, count: 0, error: keyed.error.message };
    const legacy = await run("legacy");
    if (legacy.error) return { ok: false, count: keyed.rows, error: legacy.error.message };
    return { ok: true, count: keyed.rows + legacy.rows };
  };

  const sms = await deleteFrom("manager_sms_messages", "resident_phone");
  if (!sms.ok) {
    console.error("deleteManagerSmsConversation sms failed", sms.error);
    return { ok: false, error: sms.error ?? "delete_failed" };
  }
  deleted += sms.count;

  // Also clear inbound log rows for this counterparty.
  const inbound = await deleteFrom("inbound_sms_log", "from_phone");
  if (!inbound.ok) {
    console.error("deleteManagerSmsConversation inbound failed", inbound.error);
  } else {
    deleted += inbound.count;
  }

  return { ok: true, deleted };
}


/**
 * The explicit conversation-identity columns for an `inbound_sms_log` insert.
 * Spread into the insert so every inbound row threads by (owner, role, person)
 * exactly like `manager_sms_messages`, keeping the two logs in one thread.
 */
export function inboundLogIdentityFields(args: {
  managerUserId: string | null;
  counterpartyRole?: SmsCounterpartyRole;
  counterpartyUserId?: string | null;
  fromPhone: string;
}): { counterparty_role: SmsCounterpartyRole; conversation_key: string } {
  const counterpartyUserId = args.counterpartyUserId?.trim() || null;
  const role =
    args.counterpartyRole ??
    deriveCounterpartyRole({ hasResidentUserId: Boolean(counterpartyUserId) });
  return {
    counterparty_role: role,
    conversation_key: buildConversationKey({
      ownerManagerUserId: args.managerUserId,
      role,
      counterpartyUserId,
      counterpartyPhone: args.fromPhone,
    }),
  };
}

export async function logManagerSmsMessage(
  db: SupabaseClient,
  args: {
    managerUserId: string;
    residentPhone: string;
    residentUserId?: string | null;
    direction: "inbound" | "outbound";
    body: string;
    fromPhone?: string | null;
    toPhone: string;
    messageSid?: string | null;
    source?: "work_number" | "relay" | "automated";
    /**
     * The counterparty's capacity in this thread. On a shared line the role is
     * what separates a prospect from a resident on the SAME phone, so pass it
     * from the routing classification. Defaults to a conservative derivation.
     */
    counterpartyRole?: SmsCounterpartyRole;
  },
): Promise<boolean> {
  const managerUserId = args.managerUserId.trim();
  const residentPhone = phoneKey(args.residentPhone);
  const toPhone = phoneKey(args.toPhone);
  if (!managerUserId || !residentPhone || !toPhone) return false;

  const residentUserId = args.residentUserId?.trim() || null;
  const counterpartyRole =
    args.counterpartyRole ??
    deriveCounterpartyRole({ hasResidentUserId: Boolean(residentUserId) });
  const conversationKey = buildConversationKey({
    ownerManagerUserId: managerUserId,
    role: counterpartyRole,
    counterpartyUserId: residentUserId,
    counterpartyPhone: residentPhone,
  });

  const row = {
    manager_user_id: managerUserId,
    resident_user_id: residentUserId,
    resident_phone: residentPhone,
    direction: args.direction,
    body: args.body.trim().slice(0, 1600),
    from_phone: args.fromPhone ? phoneKey(args.fromPhone) : null,
    to_phone: toPhone,
    message_sid: args.messageSid?.trim() || null,
    source: args.source ?? "work_number",
    counterparty_role: counterpartyRole,
    conversation_key: conversationKey,
  };

  if (row.message_sid) {
    const { data: existing } = await db
      .from("manager_sms_messages")
      .select("id")
      .eq("message_sid", row.message_sid)
      .limit(1);
    if ((existing ?? []).length > 0) return true;
  }

  const { error } = await db.from("manager_sms_messages").insert(row);
  if (error) {
    // Unique sid race — treat as already logged.
    if (error.code === "23505") return true;
    console.error("logManagerSmsMessage insert failed", error.message, {
      managerUserId,
      residentPhone,
      direction: row.direction,
    });
    return false;
  }
  return true;
}

type ResidentSeed = {
  residentUserId: string | null;
  residentEmail: string | null;
  name: string;
  phone: string | null;
  propertyLabel: string | null;
  tenancyStatus: "resident" | "applicant";
};

/** Page size and hard ceiling for the application-record scan below. */
const RESIDENT_SCAN_PAGE = 1000;
const RESIDENT_SCAN_MAX_ROWS = 20000;

/**
 * Resident seeds for a SET of owning managers in a fixed number of round-trips.
 *
 * This is the shared-line hot path: admin oversight threads across the whole
 * mapped-manager cohort, so a per-manager call here was O(N) sequential DB
 * round-trips (2 per manager) that grew with every manager who joined the line.
 * Both queries are batched with `.in(...)` instead, and the application scan
 * pages rather than silently truncating at a fixed cap — a manager whose
 * residents fell past the old per-manager `limit(500)` simply vanished from the
 * conversation list with no signal.
 *
 * Returns one entry per requested owner, each sorted by name, so the caller's
 * first-owner-wins dedup stays deterministic.
 */
async function listResidentsForOwners(
  db: SupabaseClient,
  managerUserIds: string[],
): Promise<Map<string, ResidentSeed[]>> {
  const owners = [...new Set(managerUserIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
  const byOwner = new Map<string, Map<string, ResidentSeed>>(owners.map((id) => [id, new Map()]));
  if (owners.length === 0) return new Map();

  // manager_application_records has no resident_user_id column — resolve via profiles.email.
  const appRows: { manager_user_id?: unknown; resident_email?: unknown; row_data?: unknown }[] = [];
  for (let from = 0; from < RESIDENT_SCAN_MAX_ROWS; from += RESIDENT_SCAN_PAGE) {
    const { data, error } = await db
      .from("manager_application_records")
      .select("manager_user_id, resident_email, row_data")
      .in("manager_user_id", owners)
      .order("id", { ascending: true })
      .range(from, from + RESIDENT_SCAN_PAGE - 1);
    if (error) {
      console.error("listResidentsForOwners applications failed", error.message);
      break;
    }
    appRows.push(...(data ?? []));
    if ((data?.length ?? 0) < RESIDENT_SCAN_PAGE) break;
    if (from + RESIDENT_SCAN_PAGE >= RESIDENT_SCAN_MAX_ROWS) {
      console.error(
        `[manager-sms] resident scan hit the ${RESIDENT_SCAN_MAX_ROWS}-row ceiling — some conversations may be missing`,
      );
    }
  }

  for (const row of appRows) {
    const ownerId = String(row.manager_user_id ?? "").trim();
    const seeds = byOwner.get(ownerId);
    if (!seeds) continue;
    const rd = (row.row_data ?? {}) as {
      bucket?: string;
      stage?: string;
      name?: string;
      property?: string;
      phone?: string;
      application?: { phone?: string; fullLegalName?: string };
    };
    const bucket = String(rd.bucket ?? "").trim();
    if (bucket !== "approved" && bucket !== "pending") continue;
    if (bucket === "pending" && String(rd.stage ?? "").trim().toLowerCase() === "in progress") continue;
    const email = String(row.resident_email ?? "").trim().toLowerCase();
    if (!email.includes("@")) continue;
    const propertyLabel = String(rd.property ?? "").trim() || null;
    const appPhone =
      String(rd.phone ?? "").trim() ||
      String(rd.application?.phone ?? "").trim() ||
      null;
    const name =
      String(rd.name ?? "").trim() ||
      String(rd.application?.fullLegalName ?? "").trim() ||
      email;
    const tenancyStatus = bucket === "approved" ? "resident" : "applicant";
    const existing = seeds.get(email);
    // Prefer approved over pending when both exist.
    if (existing && existing.tenancyStatus === "resident") continue;
    seeds.set(email, {
      residentUserId: existing?.residentUserId ?? null,
      residentEmail: email,
      name: existing?.name && existing.tenancyStatus === "resident" ? existing.name : name,
      phone: existing?.phone || appPhone,
      propertyLabel: existing?.propertyLabel || propertyLabel,
      tenancyStatus: existing?.tenancyStatus === "resident" ? "resident" : tenancyStatus,
    });
  }

  const emails = [...new Set([...byOwner.values()].flatMap((seeds) => [...seeds.keys()]))];
  if (emails.length > 0) {
    const { data: byEmail } = await db
      .from("profiles")
      .select("id, email, phone, full_name")
      .in("email", emails);
    for (const p of byEmail ?? []) {
      const email = String(p.email ?? "").trim().toLowerCase();
      for (const seeds of byOwner.values()) {
        const seed = seeds.get(email);
        if (!seed) continue;
        seed.residentUserId = String(p.id ?? "").trim() || null;
        if (!seed.phone) seed.phone = String(p.phone ?? "").trim() || null;
        const name = String(p.full_name ?? "").trim();
        if (name && (seed.name === email || !seed.name)) seed.name = name;
      }
    }
  }

  return new Map(
    [...byOwner.entries()].map(([ownerId, seeds]) => [
      ownerId,
      [...seeds.values()].sort((a, b) => a.name.localeCompare(b.name)),
    ]),
  );
}

export async function fetchManagerSmsConversations(
  db: SupabaseClient,
  managerUserId: string,
  /**
   * Admin oversight passes an explicit set of manager ids (the mapped
   * shared-line cohort) instead of the co-manager scope. When set, every
   * conversation is threaded across those managers exactly as each manager
   * sees their own — so admin can pick a specific counterparty on the shared
   * line rather than reading one flat stream.
   */
  options?: {
    scopeManagerIdsOverride?: string[];
    /**
     * Whether `managerUserId`'s work number may be PURCHASED on demand.
     * `resolveManagerWorkNumber` falls through to `ensureManagerSmsNumber`,
     * which buys a Twilio number — fine when the viewer is the account holder
     * loading their own SMS tab, never fine on the admin oversight path, where
     * `managerUserId` is just whichever manager sorts first in the shared-line
     * cohort. Buying a number for an arbitrary manager as a side effect of a
     * GET spends real money on a page view, so admin passes false.
     */
    provisionWorkNumber?: boolean;
  },
): Promise<ManagerSmsConversationsPayload> {
  const scopeManagerIds =
    options?.scopeManagerIdsOverride && options.scopeManagerIdsOverride.length > 0
      ? [...new Set(options.scopeManagerIdsOverride.map((id) => id.trim()).filter(Boolean))]
      : await resolveSmsScopeManagerIds(db, managerUserId);
  const mayProvision = options?.provisionWorkNumber !== false;
  // Only the VIEWER's own work number may be provisioned on demand, and only
  // when the caller opted in. The in-scope fallback is a single batched read of
  // numbers already on file: calling the provisioning-capable resolver once per
  // scope manager was both O(N) round-trips and a side effect — admin opening
  // this page could mint Twilio numbers for every manager on the shared line.
  const readNumbersOnFile = async (ids: string[]): Promise<string | null> => {
    if (ids.length === 0) return null;
    const { data } = await db.from("profiles").select("id, sms_from_number").in("id", ids);
    const numberById = new Map(
      (data ?? []).map((r) => [String(r.id ?? "").trim(), String(r.sms_from_number ?? "").trim()] as const),
    );
    // Scope order decides, so the fallback stays deterministic.
    for (const id of ids) {
      const n = numberById.get(id);
      if (n && !isPlaceholderManagerWorkNumber(n)) return n;
    }
    return null;
  };
  const ownNumber = mayProvision
    ? await resolveManagerWorkNumber(db, managerUserId)
    : // Read-only twin of resolveManagerWorkNumber: the shared agent line is a
      // constant, and anything else must already be on file.
      (isClawSharedLineBridgeEnabled()
        ? clawLeasingAgentPhoneE164()
        : await readNumbersOnFile([managerUserId]));
  const workNumber =
    ownNumber || (await readNumbersOnFile(scopeManagerIds.filter((id) => id !== managerUserId)));

  const { data: profile } = await db
    .from("profiles")
    .select("phone, phone_verified_at, sms_forward_inbound, sms_from_number")
    .eq("id", managerUserId)
    .maybeSingle();

  const residents: (ResidentSeed & { ownerManagerUserId: string })[] = [];
  const seenResidentKeys = new Set<string>();
  const residentsByOwner = await listResidentsForOwners(db, scopeManagerIds);
  for (const ownerId of scopeManagerIds) {
    for (const seed of residentsByOwner.get(ownerId) ?? []) {
      const key = seed.residentUserId || seed.residentEmail || seed.phone || seed.name;
      if (seenResidentKeys.has(key)) continue;
      seenResidentKeys.add(key);
      residents.push({ ...seed, ownerManagerUserId: ownerId });
    }
  }

  // Group every stored message under its explicit conversation identity
  // (owner + counterparty role + person ref), NOT the phone number. This is
  // what keeps two different people on one shared line in two threads, and the
  // same person in two roles (prospect vs resident) in two threads.
  type GroupMeta = {
    ownerId: string;
    role: SmsCounterpartyRole;
    counterpartyUserId: string | null;
    phoneRef: string;
    phoneDisplay: string;
  };
  const messagesByKey = new Map<string, ManagerSmsMessageRow[]>();
  const metaByKey = new Map<string, GroupMeta>();

  const pushToKey = (key: string, meta: GroupMeta, msg: ManagerSmsMessageRow): void => {
    if (!key) return;
    const list = messagesByKey.get(key) ?? [];
    if (msg.messageSid && list.some((m) => m.messageSid === msg.messageSid)) return;
    list.push(msg);
    messagesByKey.set(key, list);
    if (!metaByKey.has(key)) metaByKey.set(key, meta);
  };

  const { data: inbound } = await db
    .from("inbound_sms_log")
    .select(
      "id, manager_user_id, from_phone, to_phone, body, message_sid, matched_sender_user_id, counterparty_role, conversation_key, created_at",
    )
    .in("manager_user_id", scopeManagerIds)
    .order("created_at", { ascending: false })
    .limit(2000);

  for (const row of inbound ?? []) {
    const from = String(row.from_phone ?? "").trim();
    if (!from) continue;
    const ownerId = String(row.manager_user_id ?? "").trim() || managerUserId;
    const counterpartyUserId = String(row.matched_sender_user_id ?? "").trim() || null;
    const role = coerceCounterpartyRole(
      row.counterparty_role ?? deriveCounterpartyRole({ hasResidentUserId: Boolean(counterpartyUserId) }),
    );
    const key =
      String(row.conversation_key ?? "").trim() ||
      buildConversationKey({ ownerManagerUserId: ownerId, role, counterpartyUserId, counterpartyPhone: from });
    pushToKey(
      key,
      { ownerId, role, counterpartyUserId, phoneRef: conversationPhoneRef(from), phoneDisplay: from },
      {
        id: String(row.id),
        direction: "inbound",
        body: String(row.body ?? ""),
        fromPhone: from,
        toPhone: String(row.to_phone ?? ""),
        messageSid: row.message_sid ? String(row.message_sid) : null,
        source: "work_number",
        createdAt: String(row.created_at),
      },
    );
  }

  const { data: outbound } = await db
    .from("manager_sms_messages")
    .select(
      "id, manager_user_id, resident_user_id, resident_phone, body, from_phone, to_phone, message_sid, source, created_at, direction, counterparty_role, conversation_key",
    )
    .in("manager_user_id", scopeManagerIds)
    .order("created_at", { ascending: false })
    .limit(2000);

  for (const row of outbound ?? []) {
    const phone = String(row.resident_phone ?? "").trim();
    if (!phone) continue;
    const ownerId = String(row.manager_user_id ?? "").trim() || managerUserId;
    const counterpartyUserId = String(row.resident_user_id ?? "").trim() || null;
    const role = coerceCounterpartyRole(
      row.counterparty_role ?? deriveCounterpartyRole({ hasResidentUserId: Boolean(counterpartyUserId) }),
    );
    const key =
      String(row.conversation_key ?? "").trim() ||
      buildConversationKey({ ownerManagerUserId: ownerId, role, counterpartyUserId, counterpartyPhone: phone });
    pushToKey(
      key,
      { ownerId, role, counterpartyUserId, phoneRef: conversationPhoneRef(phone), phoneDisplay: phone },
      {
        id: String(row.id),
        direction: row.direction === "inbound" ? "inbound" : "outbound",
        body: String(row.body ?? ""),
        fromPhone: row.from_phone ? String(row.from_phone) : null,
        toPhone: String(row.to_phone ?? ""),
        messageSid: row.message_sid ? String(row.message_sid) : null,
        source: (row.source as ManagerSmsMessageRow["source"]) ?? "work_number",
        createdAt: String(row.created_at),
      },
    );
  }

  const { data: relayThreads } = await db
    .from("sms_relay_threads")
    .select("id, manager_user_id, counterparty_user_id, counterparty_name")
    .in("manager_user_id", scopeManagerIds)
    .limit(400);

  const relayCounterpartyByKey = new Map<string, { userId: string | null; name: string | null }>();
  const threadIds = (relayThreads ?? []).map((t) => String(t.id));
  if (threadIds.length > 0) {
    const { data: relayMsgs } = await db
      .from("sms_relay_messages")
      .select("id, thread_id, sender_role, body, created_at, twilio_sid")
      .in("thread_id", threadIds)
      .order("created_at", { ascending: false })
      .limit(2000);

    const threadById = new Map((relayThreads ?? []).map((t) => [String(t.id), t]));
    const { data: bindings } = await db
      .from("sms_relay_bindings")
      .select("thread_id, participant_phone, role")
      .in("thread_id", threadIds)
      .eq("role", "resident")
      .eq("active", true);

    const residentPhoneByThread = new Map<string, string>();
    for (const b of bindings ?? []) {
      residentPhoneByThread.set(String(b.thread_id), String(b.participant_phone ?? ""));
    }

    for (const msg of relayMsgs ?? []) {
      const threadId = String(msg.thread_id);
      const thread = threadById.get(threadId);
      const phone = residentPhoneByThread.get(threadId) ?? "";
      if (!phone) continue;
      const senderRole = String(msg.sender_role ?? "");
      const ownerId = String(thread?.manager_user_id ?? "").trim() || managerUserId;
      // Relay counterparties are always a known resident (bound proxy pair).
      const counterpartyUserId = String(thread?.counterparty_user_id ?? "").trim() || null;
      const key = buildConversationKey({
        ownerManagerUserId: ownerId,
        role: "resident",
        counterpartyUserId,
        counterpartyPhone: phone,
      });
      relayCounterpartyByKey.set(key, {
        userId: counterpartyUserId,
        name: String(thread?.counterparty_name ?? "").trim() || null,
      });
      pushToKey(
        key,
        {
          ownerId,
          role: "resident",
          counterpartyUserId,
          phoneRef: conversationPhoneRef(phone),
          phoneDisplay: phone,
        },
        {
          id: String(msg.id),
          direction: senderRole === "resident" ? "inbound" : "outbound",
          body: String(msg.body ?? ""),
          fromPhone: null,
          toPhone: phone,
          messageSid: msg.twilio_sid ? String(msg.twilio_sid) : null,
          source: "relay",
          createdAt: String(msg.created_at),
        },
      );
    }
  }

  const takeMessages = (key: string): ManagerSmsMessageRow[] => {
    const messages = messagesByKey.get(key) ?? [];
    messagesByKey.delete(key);
    messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return messages;
  };

  const conversations: ManagerSmsResidentConversation[] = [];

  // Directory residents/applicants: attach every non-prospect thread that
  // belongs to the SAME owner and matches this person (by account id or phone).
  // A leasing-prospect thread on the same phone stays a separate conversation.
  for (const resident of residents) {
    const ownerId = resident.ownerManagerUserId;
    const role: SmsCounterpartyRole = resident.tenancyStatus === "applicant" ? "applicant" : "resident";
    const phoneRef = conversationPhoneRef(resident.phone);
    const canonicalKey = buildConversationKey({
      ownerManagerUserId: ownerId,
      role,
      counterpartyUserId: resident.residentUserId,
      counterpartyPhone: resident.phone,
    });
    const merged: ManagerSmsMessageRow[] = [];
    for (const [key, meta] of [...metaByKey.entries()]) {
      if (meta.ownerId !== ownerId) continue;
      if (meta.role === "prospect") continue;
      const idMatch = Boolean(resident.residentUserId) && meta.counterpartyUserId === resident.residentUserId;
      const phoneMatch = Boolean(phoneRef) && meta.phoneRef === phoneRef;
      if (!idMatch && !phoneMatch) continue;
      merged.push(...takeMessages(key));
    }
    merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    conversations.push({
      residentUserId: resident.residentUserId,
      residentEmail: resident.residentEmail,
      name: resident.name,
      phone: resident.phone,
      propertyLabel: resident.propertyLabel,
      tenancyStatus: resident.tenancyStatus,
      counterpartyRole: role,
      conversationKey: canonicalKey,
      ownerManagerUserId: ownerId,
      messages: merged,
    });
  }

  // Remaining keys have no directory entry — leasing prospects, unknowns, or
  // relay-only counterparties. Each is its own conversation.
  for (const [key, meta] of metaByKey.entries()) {
    if (!messagesByKey.has(key)) continue;
    const messages = takeMessages(key);
    const relayInfo = relayCounterpartyByKey.get(key);
    conversations.push({
      residentUserId: meta.counterpartyUserId ?? relayInfo?.userId ?? null,
      residentEmail: null,
      name: relayInfo?.name || meta.phoneDisplay || key,
      phone: meta.phoneDisplay || null,
      propertyLabel: null,
      tenancyStatus: meta.role === "resident" ? "resident" : "applicant",
      counterpartyRole: meta.role,
      conversationKey: key,
      ownerManagerUserId: meta.ownerId,
      messages,
    });
  }

  conversations.sort((a, b) => {
    const aLast = a.messages[a.messages.length - 1]?.createdAt ?? "";
    const bLast = b.messages[b.messages.length - 1]?.createdAt ?? "";
    return bLast.localeCompare(aLast);
  });

  return {
    workNumber,
    personalPhone: String(profile?.phone ?? "").trim() || null,
    phoneVerified: Boolean(profile?.phone_verified_at),
    forwardInbound: profile?.sms_forward_inbound !== false,
    smsConfigured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
    residents: conversations,
  };
}

export type RoleSmsConversationPayload = {
  messages: ManagerSmsMessageRow[];
  smsConfigured: boolean;
};

/** Resident Communication → SMS: texts with linked manager(s). */
export async function fetchResidentSmsConversation(
  db: SupabaseClient,
  residentUserId: string,
): Promise<RoleSmsConversationPayload> {
  const messages: ManagerSmsMessageRow[] = [];
  const { data: profile } = await db
    .from("profiles")
    .select("phone, phone_verified_at")
    .eq("id", residentUserId)
    .maybeSingle();
  // Relay threads are matched purely by phone number, so an unverified
  // self-set phone must never be trusted here — anyone could set a victim's
  // number on their own profile and read the victim's relay history.
  const residentPhone =
    profile?.phone && profile.phone_verified_at ? phoneKey(String(profile.phone)) : "";

  const { data: stored } = await db
    .from("manager_sms_messages")
    .select("id, resident_phone, body, from_phone, to_phone, message_sid, source, created_at, direction")
    .eq("resident_user_id", residentUserId)
    .order("created_at", { ascending: true })
    .limit(500);

  for (const row of stored ?? []) {
    messages.push({
      id: String(row.id),
      // Rows are stored from the manager's perspective (inbound = resident
      // texted the manager) — flip so the resident sees their own texts as
      // sent and the manager's as received, matching the relay branch below.
      direction: row.direction === "inbound" ? "outbound" : "inbound",
      body: String(row.body ?? ""),
      fromPhone: row.from_phone ? String(row.from_phone) : null,
      toPhone: String(row.to_phone ?? ""),
      messageSid: row.message_sid ? String(row.message_sid) : null,
      source: (row.source as ManagerSmsMessageRow["source"]) ?? "work_number",
      createdAt: String(row.created_at),
    });
  }

  if (residentPhone) {
    const { data: relayBindings } = await db
      .from("sms_relay_bindings")
      .select("thread_id")
      .eq("participant_phone", residentPhone)
      .eq("role", "resident")
      .eq("active", true)
      .limit(20);
    const threadIds = (relayBindings ?? []).map((b) => String(b.thread_id));
    if (threadIds.length > 0) {
      const { data: relayMsgs } = await db
        .from("sms_relay_messages")
        .select("id, sender_role, body, created_at, twilio_sid")
        .in("thread_id", threadIds)
        .order("created_at", { ascending: true })
        .limit(500);
      for (const msg of relayMsgs ?? []) {
        const role = String(msg.sender_role ?? "");
        messages.push({
          id: `relay_${String(msg.id)}`,
          direction: role === "resident" ? "outbound" : "inbound",
          body: String(msg.body ?? ""),
          fromPhone: null,
          toPhone: residentPhone,
          messageSid: msg.twilio_sid ? String(msg.twilio_sid) : null,
          source: "relay",
          createdAt: String(msg.created_at),
        });
      }
    }
  }

  messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return {
    messages,
    smsConfigured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
  };
}

/** Vendor Communication → SMS: work-order agent texts. */
export async function fetchVendorSmsConversation(
  db: SupabaseClient,
  vendorUserId: string,
): Promise<RoleSmsConversationPayload> {
  const messages: ManagerSmsMessageRow[] = [];
  const { data: sessions } = await db
    .from("agent_sessions")
    .select("id")
    .eq("vendor_user_id", vendorUserId)
    .eq("kind", "vendor_work_order")
    .limit(50);
  const sessionIds = (sessions ?? []).map((s) => String(s.id));
  if (sessionIds.length > 0) {
    const { data: rows } = await db
      .from("agent_messages")
      .select("id, role, content, channel, created_at")
      .in("session_id", sessionIds)
      .eq("channel", "sms")
      .order("created_at", { ascending: true })
      .limit(500);
    for (const row of rows ?? []) {
      const role = String(row.role ?? "");
      messages.push({
        id: String(row.id),
        direction: role === "user" || role === "vendor" ? "outbound" : "inbound",
        body: String(row.content ?? ""),
        fromPhone: null,
        toPhone: "",
        messageSid: null,
        source: "automated",
        createdAt: String(row.created_at),
      });
    }
  }
  return {
    messages,
    smsConfigured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
  };
}

/**
 * Admin Communication → SMS: every text on the shared Claw agent line, across
 * the mapped-manager trial scope (`resolveMappedManagerContacts`) — the same
 * underlying rows those managers see in their own SMS tab, merged into one
 * read-only feed for admin oversight.
 */
/**
 * Admin Communication → SMS, GROUPED per counterparty across the mapped-manager
 * shared-line cohort. Unlike the flat feed below, this lets admin choose a
 * specific conversation on the shared line (the whole point of explicit
 * conversation identity) and reply/compose into it.
 */
export async function fetchAdminSmsConversations(
  db: SupabaseClient,
): Promise<ManagerSmsConversationsPayload> {
  const { resolveMappedManagerContacts } = await import("@/lib/claw-resident-messaging.server");
  const managerIds = [
    ...new Set(
      (await resolveMappedManagerContacts()).map((m) => String(m.userId ?? "").trim()).filter(Boolean),
    ),
  ];
  const smsConfigured = Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
  if (managerIds.length === 0) {
    return {
      workNumber: null,
      personalPhone: null,
      phoneVerified: false,
      forwardInbound: true,
      smsConfigured,
      residents: [],
    };
  }
  // `managerIds[0]` is only a threading anchor, NOT the person at the keyboard,
  // so it must never be treated as a viewer who consented to buying a number.
  return fetchManagerSmsConversations(db, managerIds[0], {
    scopeManagerIdsOverride: managerIds,
    provisionWorkNumber: false,
  });
}
