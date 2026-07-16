/**
 * Durable Claw two-way messaging: manager personal phone ↔ resident phone
 * via the shared agent line (payment / lease / move-in / leasing).
 */

import {
  clawLeasingAgentPhoneE164,
  normalizeE164Us,
  registerClawMessengerRoute,
  sendClawMessengerText,
} from "@/lib/claw-messenger.server";
import { residentPortalUrl } from "@/lib/claw-resident-links";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { upsertManagerInboxNotice } from "@/lib/sms-inbox-notice.server";

export type ClawThreadTopic = "payment" | "lease" | "leasing" | "move_in" | "general";

export type ClawMessagingThread = {
  id: string;
  managerUserId: string;
  managerPhone: string;
  residentPhone: string;
  residentUserId: string | null;
  residentEmail: string | null;
  topic: ClawThreadTopic;
  lastMessageAt: string;
};

const TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Default test / staging pairing when no durable thread exists yet. */
const DEFAULT_MANAGER_PHONE = "+15103098345";
const DEFAULT_RESIDENT_PHONE = "+15105791976";

function threadId(managerUserId: string, residentPhone: string): string {
  return `claw_thread_${managerUserId}_${residentPhone.replace(/\D/g, "")}`;
}

export function clawManagerForwardPhonesFromEnv(): string[] {
  return (process.env.CLAW_MESSENGER_MANAGER_FORWARD_PHONES ?? "")
    .split(",")
    .map((s) => normalizeE164Us(s.trim()))
    .filter((p): p is string => Boolean(p));
}

/** Default resident phone for manager→resident relay when no thread is open. */
export function clawDefaultResidentPhoneFromEnv(): string | null {
  const fromEnv = normalizeE164Us((process.env.CLAW_MESSENGER_DEFAULT_RESIDENT_PHONE ?? "").trim());
  if (fromEnv) return fromEnv;
  // Known local/test pairing used throughout the Claw messaging work.
  return DEFAULT_RESIDENT_PHONE;
}

/** SMS body the resident sees when their manager texts the agent line. */
export function labelClawSmsFromManager(text: string): string {
  const body = text.trim() || "(empty)";
  return `From your property manager:\n${body}`;
}

/** SMS body the manager sees when a resident texts the agent line. */
export function labelClawSmsFromResident(text: string, residentPhone?: string | null): string {
  const body = text.trim() || "(empty)";
  const who = residentPhone?.trim() ? `From resident (${residentPhone.trim()}):` : "From resident:";
  return `${who}\n${body}`;
}

/**
 * Carbon-copy to the manager when PropLane sends an automated text to the resident.
 * Resident still gets the plain message; manager sees the labeled copy.
 */
export function labelClawSmsFromPropLaneForManager(text: string): string {
  const body = text.trim() || "(empty)";
  return `From PropLane (sent to resident):\n${body}`;
}

export async function resolveMappedManagerContacts(): Promise<
  Array<{ userId: string; email: string; personalPhone: string | null }>
> {
  const emails = (process.env.CLAW_MESSENGER_MANAGER_EMAILS ?? "ogambik2@gmail.com,testeverything@test.axis.local,manager@test.axis.local")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (emails.length === 0) return [];
  const db = createSupabaseServiceRoleClient();
  const { data } = await db.from("profiles").select("id, email, phone").in("email", emails);
  return (data ?? []).map((row) => ({
    userId: String((row as { id?: unknown }).id ?? "").trim(),
    email: String((row as { email?: unknown }).email ?? "").trim().toLowerCase(),
    personalPhone: normalizeE164Us(String((row as { phone?: unknown }).phone ?? "")) || null,
  }));
}

export async function isMappedManagerPhone(fromE164: string): Promise<boolean> {
  const envPhones = new Set(clawManagerForwardPhonesFromEnv());
  if (envPhones.has(fromE164)) return true;
  if (fromE164 === DEFAULT_MANAGER_PHONE) return true;
  const managers = await resolveMappedManagerContacts();
  return managers.some((m) => m.personalPhone === fromE164);
}

async function resolveManagerPersonalPhone(managerUserId: string): Promise<string | null> {
  const db = createSupabaseServiceRoleClient();
  const { data } = await db.from("profiles").select("phone, email").eq("id", managerUserId).maybeSingle();
  const fromProfile = normalizeE164Us(String((data as { phone?: unknown } | null)?.phone ?? ""));
  if (fromProfile) return fromProfile;
  const email = String((data as { email?: unknown } | null)?.email ?? "")
    .trim()
    .toLowerCase();
  const mapped = await resolveMappedManagerContacts();
  const match = mapped.find((m) => m.userId === managerUserId || m.email === email);
  if (match?.personalPhone) return match.personalPhone;
  const env = clawManagerForwardPhonesFromEnv();
  return env[0] ?? DEFAULT_MANAGER_PHONE;
}

async function resolveManagerUserIdForPhone(managerPhone: string): Promise<string | null> {
  const phone = normalizeE164Us(managerPhone);
  if (!phone) return null;
  const managers = await resolveMappedManagerContacts();
  const byPhone = managers.find((m) => m.personalPhone === phone);
  if (byPhone?.userId) return byPhone.userId;
  // Env-forwarded manager cell with no profile phone match → first mapped manager.
  if (clawManagerForwardPhonesFromEnv().includes(phone) || phone === DEFAULT_MANAGER_PHONE) {
    return managers.find((m) => m.userId)?.userId ?? null;
  }
  return null;
}

function rowToThread(row: Record<string, unknown>): ClawMessagingThread {
  return {
    id: String(row.id ?? ""),
    managerUserId: String(row.manager_user_id ?? ""),
    managerPhone: String(row.manager_phone ?? ""),
    residentPhone: String(row.resident_phone ?? ""),
    residentUserId: row.resident_user_id ? String(row.resident_user_id) : null,
    residentEmail: row.resident_email ? String(row.resident_email) : null,
    topic: (String(row.topic ?? "general") as ClawThreadTopic) || "general",
    lastMessageAt: String(row.last_message_at ?? new Date().toISOString()),
  };
}

/**
 * Open / refresh a manager↔resident thread after Axis sends an SMS
 * (payment reminder, lease reminder, move-in, etc.).
 */
export async function openClawResidentThread(args: {
  managerUserId: string;
  residentPhone: string;
  residentUserId?: string | null;
  residentEmail?: string | null;
  topic: ClawThreadTopic;
}): Promise<ClawMessagingThread | null> {
  const managerUserId = args.managerUserId.trim();
  const residentPhone = normalizeE164Us(args.residentPhone);
  if (!managerUserId || !residentPhone) return null;
  if (residentPhone === clawLeasingAgentPhoneE164()) return null;
  if (await isMappedManagerPhone(residentPhone)) return null;

  const managerPhone = await resolveManagerPersonalPhone(managerUserId);
  if (!managerPhone) return null;

  const db = createSupabaseServiceRoleClient();
  const id = threadId(managerUserId, residentPhone);
  const now = new Date().toISOString();
  const payload = {
    id,
    manager_user_id: managerUserId,
    manager_phone: managerPhone,
    resident_phone: residentPhone,
    resident_user_id: args.residentUserId?.trim() || null,
    resident_email: args.residentEmail?.trim().toLowerCase() || null,
    topic: args.topic,
    last_message_at: now,
  };

  const { data, error } = await db
    .from("claw_messaging_threads")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return {
      id,
      managerUserId,
      managerPhone,
      residentPhone,
      residentUserId: args.residentUserId?.trim() || null,
      residentEmail: args.residentEmail?.trim().toLowerCase() || null,
      topic: args.topic,
      lastMessageAt: now,
    };
  }

  return rowToThread(data as Record<string, unknown>);
}

export async function findThreadByResidentPhone(residentPhone: string): Promise<ClawMessagingThread | null> {
  const phone = normalizeE164Us(residentPhone);
  if (!phone) return null;
  const db = createSupabaseServiceRoleClient();
  const cutoff = new Date(Date.now() - TTL_MS).toISOString();
  const { data } = await db
    .from("claw_messaging_threads")
    .select("*")
    .eq("resident_phone", phone)
    .gte("last_message_at", cutoff)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? rowToThread(data as Record<string, unknown>) : null;
}

export async function findLatestThreadForManagerPhone(managerPhone: string): Promise<ClawMessagingThread | null> {
  const phone = normalizeE164Us(managerPhone);
  if (!phone) return null;
  const db = createSupabaseServiceRoleClient();
  const cutoff = new Date(Date.now() - TTL_MS).toISOString();
  const { data } = await db
    .from("claw_messaging_threads")
    .select("*")
    .eq("manager_phone", phone)
    .gte("last_message_at", cutoff)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? rowToThread(data as Record<string, unknown>) : null;
}

/**
 * Prefer an existing thread for this manager phone; otherwise open one to the
 * configured default resident so the manager can always text without waiting
 * for a payment/lease outbound first.
 */
export async function resolveOrCreateThreadForManagerPhone(
  managerPhone: string,
): Promise<ClawMessagingThread | null> {
  const phone = normalizeE164Us(managerPhone);
  if (!phone) return null;

  const existing = await findLatestThreadForManagerPhone(phone);
  if (existing) return existing;

  const defaultResident = clawDefaultResidentPhoneFromEnv();
  if (!defaultResident || defaultResident === phone) return null;

  const managerUserId = await resolveManagerUserIdForPhone(phone);
  if (!managerUserId) return null;

  return openClawResidentThread({
    managerUserId,
    residentPhone: defaultResident,
    topic: "general",
  });
}

async function touchThread(thread: ClawMessagingThread, topic?: ClawThreadTopic): Promise<void> {
  const db = createSupabaseServiceRoleClient();
  await db
    .from("claw_messaging_threads")
    .update({
      last_message_at: new Date().toISOString(),
      ...(topic ? { topic } : {}),
    })
    .eq("id", thread.id);
}

/**
 * Known resident phone (has a profile) — used to route inbound away from leasing bot
 * even before the first Axis outbound opened a thread.
 */
export async function findResidentProfileByPhone(phone: string): Promise<{
  userId: string;
  email: string;
  managerUserId: string | null;
} | null> {
  const e164 = normalizeE164Us(phone);
  if (!e164) return null;
  const db = createSupabaseServiceRoleClient();
  const { data: profile } = await db
    .from("profiles")
    .select("id, email, role")
    .eq("phone", e164)
    .maybeSingle();
  if (!profile) return null;
  const userId = String((profile as { id?: unknown }).id ?? "").trim();
  const email = String((profile as { email?: unknown }).email ?? "")
    .trim()
    .toLowerCase();
  if (!userId || !email) return null;

  // Prefer an active lease's manager for this resident email.
  const { data: lease } = await db
    .from("portal_lease_pipeline_records")
    .select("manager_user_id")
    .eq("resident_email", email)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let managerUserId = String((lease as { manager_user_id?: unknown } | null)?.manager_user_id ?? "").trim() || null;

  if (!managerUserId) {
    const { data: app } = await db
      .from("manager_application_records")
      .select("manager_user_id")
      .eq("email", email)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    managerUserId = String((app as { manager_user_id?: unknown } | null)?.manager_user_id ?? "").trim() || null;
  }

  return { userId, email, managerUserId };
}

export async function forwardResidentMessageToManagers(args: {
  fromResident: string;
  text: string;
  topicLabel: string;
  thread: ClawMessagingThread;
  /** When set, sent instead of the default "From resident:" wrapper. */
  briefText?: string | null;
}): Promise<{ forwardedTo: string[] }> {
  void args.topicLabel;
  const targets = new Set<string>();
  for (const p of clawManagerForwardPhonesFromEnv()) targets.add(p);
  if (args.thread.managerPhone) targets.add(args.thread.managerPhone);
  const managers = await resolveMappedManagerContacts();
  for (const m of managers) {
    if (m.userId === args.thread.managerUserId && m.personalPhone) targets.add(m.personalPhone);
  }
  targets.add(DEFAULT_MANAGER_PHONE);
  targets.delete(args.fromResident);
  targets.delete(clawLeasingAgentPhoneE164());

  const body = args.briefText?.trim() || labelClawSmsFromResident(args.text, args.fromResident);

  const forwardedTo: string[] = [];
  for (const to of targets) {
    await registerClawMessengerRoute(to);
    const send = await sendClawMessengerText({ to, text: body });
    if (send.ok) forwardedTo.push(to);
  }

  await touchThread(args.thread);
  return { forwardedTo };
}

export async function tryRelayManagerReplyViaClaw(args: {
  from: string;
  text: string;
}): Promise<{ relayed: boolean; to?: string; error?: string }> {
  const from = normalizeE164Us(args.from);
  if (!from) return { relayed: false, error: "invalid_from" };
  if (!(await isMappedManagerPhone(from))) return { relayed: false };

  const thread = await resolveOrCreateThreadForManagerPhone(from);
  if (!thread) {
    await registerClawMessengerRoute(from);
    await sendClawMessengerText({
      to: from,
      text: "Could not reach a resident phone for this PropLane line. Check CLAW_MESSENGER_DEFAULT_RESIDENT_PHONE.",
    });
    return { relayed: false, error: "no_open_thread" };
  }

  const text = (args.text ?? "").trim();
  if (!text) return { relayed: false, error: "empty" };

  const outbound = labelClawSmsFromManager(text);
  await registerClawMessengerRoute(thread.residentPhone);
  const send = await sendClawMessengerText({ to: thread.residentPhone, text: outbound });
  if (!send.ok) return { relayed: false, error: send.error || "send_failed" };

  await touchThread(thread);
  return { relayed: true, to: thread.residentPhone };
}

/**
 * After PropLane texts a resident, also send a labeled copy to their manager
 * so both sides share the same automated trail.
 */
export async function mirrorAutomatedResidentSmsToManager(args: {
  managerUserId: string;
  residentPhone: string;
  text: string;
  residentUserId?: string | null;
  residentEmail?: string | null;
  topic?: ClawThreadTopic;
}): Promise<{ mirrored: boolean; to?: string }> {
  const managerUserId = args.managerUserId.trim();
  const residentPhone = normalizeE164Us(args.residentPhone);
  const plain = args.text.trim();
  if (!managerUserId || !residentPhone || !plain) return { mirrored: false };

  const thread = await openClawResidentThread({
    managerUserId,
    residentPhone,
    residentUserId: args.residentUserId,
    residentEmail: args.residentEmail,
    topic: args.topic ?? "general",
  });
  const managerPhone = thread?.managerPhone || (await resolveManagerPersonalPhone(managerUserId));
  if (!managerPhone || managerPhone === residentPhone) return { mirrored: false };

  const body = labelClawSmsFromPropLaneForManager(plain);
  await registerClawMessengerRoute(managerPhone);
  const send = await sendClawMessengerText({ to: managerPhone, text: body });
  if (!send.ok) return { mirrored: false };

  if (thread) await touchThread(thread, args.topic);
  return { mirrored: true, to: managerPhone };
}

export function residentInboundAck(topic: ClawThreadTopic): string {
  switch (topic) {
    case "payment":
      return [
        "Got it — your property manager will see this and reply here about your payment.",
        `Pay / view charges: ${residentPortalUrl("payments")}`,
      ].join("\n");
    case "lease":
      return [
        "Got it — your property manager will see this and reply here about your lease.",
        `Sign / view lease: ${residentPortalUrl("lease")}`,
      ].join("\n");
    case "move_in":
      return [
        "Got it — your property manager will see this and reply here about move-in.",
        `Move-in details: ${residentPortalUrl("move_in")}`,
      ].join("\n");
    default:
      return [
        "Got it — your property manager will see this and can reply on this thread.",
        `Open inbox: ${residentPortalUrl("inbox")}`,
      ].join("\n");
  }
}

export async function mirrorResidentTextToManagerInbox(args: {
  thread: ClawMessagingThread;
  from: string;
  text: string;
  service?: string | null;
  subject?: string | null;
  body?: string | null;
}): Promise<void> {
  const db = createSupabaseServiceRoleClient();
  const body =
    args.body?.trim() ||
    [
      `Inbound (${args.service || "iMessage/SMS"}) from ${args.from}`,
      args.thread.residentEmail ? `Resident: ${args.thread.residentEmail}` : null,
      `Topic: ${args.thread.topic}`,
      "",
      args.text || "(empty message)",
      "",
      "— Reply from your personal phone in the PropLane iMessage thread to text them back —",
    ]
      .filter((line) => line !== null)
      .join("\n");
  await upsertManagerInboxNotice(db, {
    managerUserId: args.thread.managerUserId,
    idPrefix: "claw_resident",
    threadType: "claw_resident_sms",
    from: args.from,
    subject: args.subject?.trim() || `Resident text from ${args.from}`,
    preview: (args.text || body).slice(0, 140) || "(empty)",
    body,
    unread: true,
  });
}
