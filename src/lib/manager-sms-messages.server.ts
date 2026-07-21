import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { linkedOwnerScopeForModule } from "@/lib/auth/co-manager-module-scope";
import type {
  ManagerSmsConversationsPayload,
  ManagerSmsMessageRow,
  ManagerSmsResidentConversation,
} from "@/lib/manager-sms-messages";
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

export async function deleteManagerSmsConversation(
  db: SupabaseClient,
  args: { managerUserId: string; phone: string },
): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const managerUserId = args.managerUserId.trim();
  const phone = phoneKey(args.phone);
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

  const { data: smsRows, error: smsErr } = await db
    .from("manager_sms_messages")
    .delete()
    .eq("manager_user_id", managerUserId)
    .in("resident_phone", variants)
    .select("id");
  if (smsErr) {
    console.error("deleteManagerSmsConversation sms failed", smsErr.message);
    return { ok: false, error: smsErr.message };
  }
  deleted += smsRows?.length ?? 0;

  // Also clear inbound log rows for this counterparty.
  const { data: inboundRows, error: inboundErr } = await db
    .from("inbound_sms_log")
    .delete()
    .eq("manager_user_id", managerUserId)
    .in("from_phone", variants)
    .select("id");
  if (inboundErr) {
    console.error("deleteManagerSmsConversation inbound failed", inboundErr.message);
  } else {
    deleted += inboundRows?.length ?? 0;
  }

  return { ok: true, deleted };
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
  },
): Promise<boolean> {
  const managerUserId = args.managerUserId.trim();
  const residentPhone = phoneKey(args.residentPhone);
  const toPhone = phoneKey(args.toPhone);
  if (!managerUserId || !residentPhone || !toPhone) return false;

  const row = {
    manager_user_id: managerUserId,
    resident_user_id: args.residentUserId?.trim() || null,
    resident_phone: residentPhone,
    direction: args.direction,
    body: args.body.trim().slice(0, 1600),
    from_phone: args.fromPhone ? phoneKey(args.fromPhone) : null,
    to_phone: toPhone,
    message_sid: args.messageSid?.trim() || null,
    source: args.source ?? "work_number",
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

async function listManagerResidents(db: SupabaseClient, managerUserId: string): Promise<ResidentSeed[]> {
  // manager_application_records has no resident_user_id column — resolve via profiles.email.
  const { data: apps, error: appsError } = await db
    .from("manager_application_records")
    .select("resident_email, row_data")
    .eq("manager_user_id", managerUserId)
    .limit(500);

  if (appsError) {
    console.error("listManagerResidents applications failed", appsError.message);
  }

  const seeds = new Map<string, ResidentSeed>();
  for (const row of apps ?? []) {
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

  const emails = [...seeds.keys()];
  if (emails.length > 0) {
    const { data: byEmail } = await db
      .from("profiles")
      .select("id, email, phone, full_name")
      .in("email", emails);
    for (const p of byEmail ?? []) {
      const email = String(p.email ?? "").trim().toLowerCase();
      const seed = seeds.get(email);
      if (!seed) continue;
      seed.residentUserId = String(p.id ?? "").trim() || null;
      if (!seed.phone) seed.phone = String(p.phone ?? "").trim() || null;
      const name = String(p.full_name ?? "").trim();
      if (name && (seed.name === email || !seed.name)) seed.name = name;
    }
  }

  return [...seeds.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function pushMessage(
  bucket: Map<string, ManagerSmsMessageRow[]>,
  phone: string,
  msg: ManagerSmsMessageRow,
): void {
  const key = phoneKey(phone);
  if (!key) return;
  const list = bucket.get(key) ?? [];
  if (msg.messageSid && list.some((m) => m.messageSid === msg.messageSid)) return;
  list.push(msg);
  bucket.set(key, list);
}

export async function fetchManagerSmsConversations(
  db: SupabaseClient,
  managerUserId: string,
): Promise<ManagerSmsConversationsPayload> {
  const scopeManagerIds = await resolveSmsScopeManagerIds(db, managerUserId);
  const workNumber =
    (await resolveManagerWorkNumber(db, managerUserId)) ||
    (await (async () => {
      for (const id of scopeManagerIds) {
        if (id === managerUserId) continue;
        const n = await resolveManagerWorkNumber(db, id);
        if (n) return n;
      }
      return null;
    })());

  const { data: profile } = await db
    .from("profiles")
    .select("phone, phone_verified_at, sms_forward_inbound, sms_from_number")
    .eq("id", managerUserId)
    .maybeSingle();

  const residents: ResidentSeed[] = [];
  const seenResidentKeys = new Set<string>();
  for (const ownerId of scopeManagerIds) {
    for (const seed of await listManagerResidents(db, ownerId)) {
      const key = seed.residentUserId || seed.residentEmail || seed.phone || seed.name;
      if (seenResidentKeys.has(key)) continue;
      seenResidentKeys.add(key);
      residents.push(seed);
    }
  }

  const messagesByPhone = new Map<string, ManagerSmsMessageRow[]>();
  const ownerByPhone = new Map<string, string>();

  const { data: inbound } = await db
    .from("inbound_sms_log")
    .select("id, manager_user_id, from_phone, to_phone, body, message_sid, matched_sender_user_id, created_at")
    .in("manager_user_id", scopeManagerIds)
    .order("created_at", { ascending: false })
    .limit(2000);

  for (const row of inbound ?? []) {
    const from = String(row.from_phone ?? "").trim();
    if (!from) continue;
    const ownerId = String(row.manager_user_id ?? "").trim() || managerUserId;
    const key = phoneKey(from);
    if (key && !ownerByPhone.has(key)) ownerByPhone.set(key, ownerId);
    pushMessage(messagesByPhone, from, {
      id: String(row.id),
      direction: "inbound",
      body: String(row.body ?? ""),
      fromPhone: from,
      toPhone: String(row.to_phone ?? ""),
      messageSid: row.message_sid ? String(row.message_sid) : null,
      source: "work_number",
      createdAt: String(row.created_at),
    });
  }

  const { data: outbound } = await db
    .from("manager_sms_messages")
    .select(
      "id, manager_user_id, resident_phone, body, from_phone, to_phone, message_sid, source, created_at, direction",
    )
    .in("manager_user_id", scopeManagerIds)
    .order("created_at", { ascending: false })
    .limit(2000);

  for (const row of outbound ?? []) {
    const phone = String(row.resident_phone ?? "").trim();
    if (!phone) continue;
    const ownerId = String(row.manager_user_id ?? "").trim() || managerUserId;
    const key = phoneKey(phone);
    if (key && !ownerByPhone.has(key)) ownerByPhone.set(key, ownerId);
    pushMessage(messagesByPhone, phone, {
      id: String(row.id),
      direction: row.direction === "inbound" ? "inbound" : "outbound",
      body: String(row.body ?? ""),
      fromPhone: row.from_phone ? String(row.from_phone) : null,
      toPhone: String(row.to_phone ?? ""),
      messageSid: row.message_sid ? String(row.message_sid) : null,
      source: (row.source as ManagerSmsMessageRow["source"]) ?? "work_number",
      createdAt: String(row.created_at),
    });
  }

  const { data: relayThreads } = await db
    .from("sms_relay_threads")
    .select("id, manager_user_id, counterparty_user_id, counterparty_name")
    .in("manager_user_id", scopeManagerIds)
    .limit(400);

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
      const role = String(msg.sender_role ?? "");
      const ownerId = String(thread?.manager_user_id ?? "").trim() || managerUserId;
      const key = phoneKey(phone);
      if (key && !ownerByPhone.has(key)) ownerByPhone.set(key, ownerId);
      pushMessage(messagesByPhone, phone, {
        id: String(msg.id),
        direction: role === "resident" ? "inbound" : "outbound",
        body: String(msg.body ?? ""),
        fromPhone: null,
        toPhone: phone,
        messageSid: msg.twilio_sid ? String(msg.twilio_sid) : null,
        source: "relay",
        createdAt: String(msg.created_at),
      });
      if (
        thread?.counterparty_user_id &&
        !residents.some((r) => r.residentUserId === String(thread.counterparty_user_id))
      ) {
        residents.push({
          residentUserId: String(thread.counterparty_user_id),
          residentEmail: null,
          name: String(thread.counterparty_name ?? "Resident").trim() || "Resident",
          phone,
          propertyLabel: null,
          tenancyStatus: "resident",
        });
      }
    }
  }

  const conversations: ManagerSmsResidentConversation[] = residents.map((resident) => {
    const phone = resident.phone ? phoneKey(resident.phone) : "";
    const messages = phone ? (messagesByPhone.get(phone) ?? []) : [];
    messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return {
      ...resident,
      ownerManagerUserId: phone ? ownerByPhone.get(phone) ?? managerUserId : managerUserId,
      messages,
    };
  });

  for (const [phone, messages] of messagesByPhone.entries()) {
    if (conversations.some((c) => c.phone && phoneKey(c.phone) === phone)) continue;
    messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    conversations.push({
      residentUserId: null,
      residentEmail: null,
      name: phone,
      phone,
      propertyLabel: null,
      tenancyStatus: "applicant",
      ownerManagerUserId: ownerByPhone.get(phone) ?? managerUserId,
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
export async function fetchAdminSharedLineSmsConversation(
  db: SupabaseClient,
): Promise<RoleSmsConversationPayload> {
  const { resolveMappedManagerContacts } = await import("@/lib/claw-resident-messaging.server");
  const managerIds = (await resolveMappedManagerContacts()).map((m) => m.userId).filter(Boolean);
  const smsConfigured = Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
  if (managerIds.length === 0) return { messages: [], smsConfigured };

  const messages: ManagerSmsMessageRow[] = [];
  const seenSids = new Set<string>();
  const addMessage = (row: ManagerSmsMessageRow) => {
    if (row.messageSid) {
      if (seenSids.has(row.messageSid)) return;
      seenSids.add(row.messageSid);
    }
    messages.push(row);
  };

  const { data: inbound } = await db
    .from("inbound_sms_log")
    .select("id, from_phone, to_phone, body, message_sid, created_at")
    .in("manager_user_id", managerIds)
    .order("created_at", { ascending: false })
    .limit(1000);
  for (const row of inbound ?? []) {
    addMessage({
      id: String(row.id),
      direction: "inbound",
      body: String(row.body ?? ""),
      fromPhone: row.from_phone ? String(row.from_phone) : null,
      toPhone: String(row.to_phone ?? ""),
      messageSid: row.message_sid ? String(row.message_sid) : null,
      source: "work_number",
      createdAt: String(row.created_at),
    });
  }

  const { data: outbound } = await db
    .from("manager_sms_messages")
    .select("id, body, from_phone, to_phone, message_sid, source, created_at, direction")
    .in("manager_user_id", managerIds)
    .order("created_at", { ascending: false })
    .limit(1000);
  for (const row of outbound ?? []) {
    addMessage({
      id: String(row.id),
      direction: row.direction === "inbound" ? "inbound" : "outbound",
      body: String(row.body ?? ""),
      fromPhone: row.from_phone ? String(row.from_phone) : null,
      toPhone: String(row.to_phone ?? ""),
      messageSid: row.message_sid ? String(row.message_sid) : null,
      source: (row.source as ManagerSmsMessageRow["source"]) ?? "work_number",
      createdAt: String(row.created_at),
    });
  }

  messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return { messages, smsConfigured };
}
