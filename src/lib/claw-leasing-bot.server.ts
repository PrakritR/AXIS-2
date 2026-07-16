/**
 * Leasing SMS/iMessage auto-replies for the shared Claw Messenger agent line.
 *
 * Residents text the agent number about tours / applications / leases; we reply
 * with deep links (apply) or intake questions (tour) and mirror the thread into
 * the mapped manager's Axis inbox.
 */

import { after } from "next/server";
import {
  buildManagerApplyUrl,
  buildManagerListingUrl,
} from "@/lib/manager-property-links";
import { residentPortalUrl } from "@/lib/claw-resident-links";
import {
  classifyLeasingIntent,
  extractBundleIdHint,
  extractBundleLabelHint,
  extractPropertyIdHint,
  extractPropertyLabelHint,
  looksLikeProspectLeasingCta,
  type LeasingIntent,
} from "@/lib/claw-leasing-links";
import {
  clawLeasingAgentPhoneE164,
  normalizeE164Us,
  registerClawMessengerRoute,
  sendClawMessengerText,
} from "@/lib/claw-messenger.server";
import {
  forwardClawInboundToManagers,
  isMappedManagerPhone,
  tryRelayManagerReplyViaClaw,
} from "@/lib/claw-relay.server";
import {
  clawMappedManagerEmails,
  findResidentProfileByPhone,
  findThreadByResidentPhone,
  forwardResidentMessageToManagers,
  mirrorResidentTextToManagerInbox,
  openClawResidentThread,
} from "@/lib/claw-resident-messaging.server";
import { buildManagerResidentBrief, runResidentSmsAction } from "@/lib/claw-resident-actions.server";
import { upsertManagerInboxNotice } from "@/lib/sms-inbox-notice.server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export {
  buildSmsDeepLink,
  classifyLeasingIntent,
  extractBundleIdHint,
  extractPropertyIdHint,
  looksLikeProspectLeasingCta,
  type LeasingIntent,
} from "@/lib/claw-leasing-links";

export { clawMappedManagerEmails } from "@/lib/claw-resident-messaging.server";

export function publicAppOrigin(): string {
  // SMS links must be phone-reachable — never localhost.
  const explicit = process.env.CLAW_MESSENGER_LINK_ORIGIN?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const app = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (app && !/localhost|127\.0\.0\.1/i.test(app)) return app.replace(/\/$/, "");
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) return `https://${production}`.replace(/\/$/, "");
  return "https://www.axis-seattle-housing.com";
}

type ManagerTarget = {
  userId: string;
  email: string;
  fullName: string | null;
  defaultPropertyId: string | null;
  defaultPropertyLabel: string | null;
};

type PropertyHint = { propertyId: string; propertyLabel: string | null };

async function resolveMappedManagers(): Promise<ManagerTarget[]> {
  const emails = clawMappedManagerEmails();
  if (emails.length === 0) return [];
  const db = createSupabaseServiceRoleClient();
  const { data: profiles } = await db
    .from("profiles")
    .select("id, email, full_name")
    .in("email", emails);

  const out: ManagerTarget[] = [];
  for (const profile of profiles ?? []) {
    const userId = String((profile as { id?: unknown }).id ?? "").trim();
    const email = String((profile as { email?: unknown }).email ?? "").trim().toLowerCase();
    if (!userId || !email) continue;

    const { data: props } = await db
      .from("manager_property_records")
      .select("id, property_data, status")
      .eq("manager_user_id", userId)
      .in("status", ["live", "listed"])
      .order("updated_at", { ascending: false })
      .limit(1);

    const first = props?.[0] as
      | { id?: string; property_data?: { title?: string; address?: string; buildingName?: string } | null }
      | undefined;
    const propertyId = first?.id?.trim() || null;
    const label =
      first?.property_data?.buildingName?.trim() ||
      first?.property_data?.title?.trim() ||
      first?.property_data?.address?.trim() ||
      null;

    out.push({
      userId,
      email,
      fullName: String((profile as { full_name?: unknown }).full_name ?? "").trim() || null,
      defaultPropertyId: propertyId,
      defaultPropertyLabel: label,
    });
  }
  return out;
}

async function resolvePropertyHint(
  propertyId: string | null,
  managers: ManagerTarget[],
): Promise<PropertyHint | null> {
  const id = propertyId?.trim();
  if (!id || managers.length === 0) return null;
  const db = createSupabaseServiceRoleClient();
  // Untrusted SMS token: only ever resolve to a mapped manager's LISTED
  // property — never confirm or link other landlords' (or unlisted) records.
  const { data } = await db
    .from("manager_property_records")
    .select("id, property_data")
    .eq("id", id)
    .in(
      "manager_user_id",
      managers.map((m) => m.userId),
    )
    .in("status", ["live", "listed"])
    .maybeSingle();
  if (!data) return null;
  const pd = (data as { property_data?: { title?: string; address?: string; buildingName?: string } | null })
    .property_data;
  const label = pd?.buildingName?.trim() || pd?.title?.trim() || pd?.address?.trim() || null;
  return { propertyId: id, propertyLabel: label };
}

function propertyDisplayLabel(pd: { title?: string; address?: string; buildingName?: string } | null | undefined): string {
  return pd?.buildingName?.trim() || pd?.title?.trim() || pd?.address?.trim() || "";
}

async function resolvePropertyByLabelHint(
  labelHint: string | null,
  managers: ManagerTarget[],
): Promise<PropertyHint | null> {
  const needle = (labelHint ?? "").trim().toLowerCase();
  if (!needle) return null;
  if (managers.length === 0) return null;
  const db = createSupabaseServiceRoleClient();
  const { data } = await db
    .from("manager_property_records")
    .select("id, property_data, manager_user_id, status")
    .in(
      "manager_user_id",
      managers.map((m) => m.userId),
    )
    .in("status", ["live", "listed"])
    .limit(100);

  let best: PropertyHint | null = null;
  for (const row of data ?? []) {
    const id = String((row as { id?: unknown }).id ?? "").trim();
    const pd = (row as { property_data?: { title?: string; address?: string; buildingName?: string } | null })
      .property_data;
    const label = propertyDisplayLabel(pd);
    if (!id || !label) continue;
    const lower = label.toLowerCase();
    if (lower === needle || needle.includes(lower) || lower.includes(needle)) {
      best = { propertyId: id, propertyLabel: label };
      if (lower === needle) return best;
    }
  }
  return best;
}

async function resolveBundleIdByLabel(propertyId: string | null, bundleLabel: string | null): Promise<string | null> {
  const pid = propertyId?.trim();
  const needle = (bundleLabel ?? "").trim().toLowerCase();
  if (!pid || !needle) return null;
  const db = createSupabaseServiceRoleClient();
  const { data } = await db
    .from("manager_property_records")
    .select("property_data")
    .eq("id", pid)
    .maybeSingle();
  const pd = (data as { property_data?: { listingSubmission?: { bundles?: Array<{ id?: string; label?: string; name?: string }> } } | null })
    ?.property_data;
  const bundles = pd?.listingSubmission?.bundles ?? [];
  for (const b of bundles) {
    const label = (b.label ?? b.name ?? "").trim().toLowerCase();
    const id = (b.id ?? "").trim();
    if (id && label && (label === needle || label.includes(needle) || needle.includes(label))) return id;
  }
  return null;
}

/** Pure reply builder — exported for unit tests. */
export function replyForIntent(args: {
  intent: LeasingIntent;
  origin: string;
  propertyId: string | null;
  propertyLabel: string | null;
  bundleId?: string | null;
}): string {
  const { intent, origin, propertyId, propertyLabel } = args;
  const bundleId = args.bundleId?.trim() || null;
  const where = propertyLabel ? ` for ${propertyLabel}` : "";
  const apply = propertyId
    ? buildManagerApplyUrl(origin, { propertyId, bundleId: bundleId || undefined })
    : `${origin}/rent/apply`;
  const listing = propertyId ? buildManagerListingUrl(origin, propertyId) : `${origin}/rent`;
  const leasePortal = residentPortalUrl("lease");
  const signup = residentPortalUrl("signup");

  switch (intent) {
    case "tour":
      return [
        `Nice — happy to set up a tour${where}.`,
        `Just reply with your name, email, a couple times that work, and which room you're looking at (or say you're not sure yet).`,
        `Once we have that we'll lock in a time.`,
      ].join("\n");
    case "tour_details":
      return [
        `Perfect, got your tour details${where}.`,
        `We'll confirm a time once the manager picks one.`,
        apply ? `If you want to apply in the meantime: ${apply}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    case "apply":
      return [
        `Here's the application${where}:`,
        apply,
        `Want a tour first instead? Just say so.`,
      ].join("\n");
    case "bundle":
      return [
        `Here's the bundle application${where}:`,
        apply,
        `Any questions, just text back.`,
      ].join("\n");
    case "question":
      return [
        `Got your note${where} — someone will reply here.`,
        `Need the application link? Say apply. Want a tour? Say tour.`,
      ].join("\n");
    case "lease":
      return [
        `Lease signing is here:`,
        leasePortal,
        `Need an account first? ${signup}`,
      ].join("\n");
    case "greeting":
    case "help":
      return [
        `Hey${where ? ` — ${propertyLabel}` : ""}.`,
        `Tell me what you need (tour, apply, lease, rent, whatever) and I'll help from here.`,
        propertyId ? `Listing: ${listing}` : `Browse: ${origin}/rent`,
      ].join("\n");
    default:
      return [
        `Got it${where}. Someone will reply here.`,
        `Or just say tour / apply if that's what you need.`,
        propertyId ? `Listing: ${listing}` : `Browse: ${origin}/rent`,
      ].join("\n");
  }
}

export type HandleClawInboundResult = {
  ok: boolean;
  intent: LeasingIntent;
  replied: boolean;
  error?: string;
};

/* In-memory idempotency for redelivered relay frames (gateway restarts, webhook
 * retries): a messageId is processed at most once per warm process per TTL. */
const SEEN_INBOUND_TTL_MS = 60 * 60 * 1000;
const seenInboundMessageIds = new Map<string, number>();

function markInboundMessageSeen(messageId: string): boolean {
  const now = Date.now();
  const prev = seenInboundMessageIds.get(messageId);
  if (prev && now - prev < SEEN_INBOUND_TTL_MS) return false;
  if (seenInboundMessageIds.size > 2000) {
    for (const [key, ts] of seenInboundMessageIds) {
      if (now - ts >= SEEN_INBOUND_TTL_MS || seenInboundMessageIds.size > 2000) {
        seenInboundMessageIds.delete(key);
      } else {
        break;
      }
    }
  }
  seenInboundMessageIds.set(messageId, now);
  return true;
}

/** Run manager forwards / inbox mirrors after the reply is out the door.
 * after() needs a live request scope — outside one (tests) run inline. */
function runAfterReply(task: () => Promise<unknown>): void {
  const safe = () => task().catch((e) => console.error("claw deferred task failed", e));
  try {
    after(safe);
  } catch {
    void safe();
  }
}

/**
 * Process one inbound Claw Messenger text.
 * Order: manager relay → known resident messaging → leasing auto-reply.
 */
export async function handleClawLeasingInbound(args: {
  from: string;
  text: string;
  messageId?: string | null;
  chatId?: string | null;
  service?: string | null;
}): Promise<HandleClawInboundResult> {
  const from = normalizeE164Us(args.from);
  if (!from) return { ok: false, intent: "unknown", replied: false, error: "Invalid from phone." };

  // Never react to frames from the agent's own line — replying would loop the
  // bot against itself through the relay.
  if (from === clawLeasingAgentPhoneE164()) {
    return { ok: true, intent: "unknown", replied: false };
  }

  const messageId = args.messageId?.trim() || "";
  if (messageId && !markInboundMessageSeen(messageId)) {
    return { ok: true, intent: "unknown", replied: false };
  }

  const text = (args.text ?? "").trim();

  // Manager typing from their personal phone.
  // "agent …" commands run locally (mark paid, lease link, …) and are NOT relayed.
  // Everything else relays to the open resident thread (unless it's a listing CTA).
  if ((await isMappedManagerPhone(from)) && !looksLikeProspectLeasingCta(text)) {
    const { runManagerAgentCommand } = await import("@/lib/claw-manager-actions.server");
    const agent = await runManagerAgentCommand({ fromPhone: from, text });
    if (agent) {
      await registerClawMessengerRoute(from);
      const send = await sendClawMessengerText({ to: from, text: agent.reply });
      return {
        ok: send.ok,
        intent: "unknown",
        replied: send.ok,
        error: send.ok ? undefined : send.error,
      };
    }
    const relay = await tryRelayManagerReplyViaClaw({ from, text });
    return {
      ok: relay.relayed || relay.error === "no_open_thread",
      intent: "unknown",
      replied: relay.relayed,
      error: relay.relayed ? undefined : relay.error,
    };
  }

  // Existing resident (payment/lease thread or known profile) → two-way messaging,
  // not the leasing auto-reply menu.
  if (!looksLikeProspectLeasingCta(text)) {
    const [profile, existingThread] = await Promise.all([
      findResidentProfileByPhone(from),
      findThreadByResidentPhone(from),
    ]);
    let thread = existingThread;
    if (!thread && profile?.managerUserId) {
      thread = await openClawResidentThread({
        managerUserId: profile.managerUserId,
        residentPhone: from,
        residentUserId: profile.userId,
        residentEmail: profile.email,
        topic: "general",
      });
    }
    if (thread) {
      const registerPromise = registerClawMessengerRoute(from);
      const residentEmail = thread.residentEmail || profile?.email || "";
      const residentUserId = thread.residentUserId || profile?.userId || null;

      const action = await runResidentSmsAction({
        text,
        residentPhone: from,
        managerUserId: thread.managerUserId,
        residentUserId,
        residentEmail: residentEmail || null,
        threadTopic: thread.topic,
      });

      // Resident reply goes out first; manager forward + inbox mirror follow
      // after the response so the resident isn't waiting on them.
      await registerPromise;
      const send = await sendClawMessengerText({ to: from, text: action.residentReply });

      const threadRef = thread;
      runAfterReply(async () => {
        const brief = action.classification.skipManagerBrief
          ? null
          : buildManagerResidentBrief({
              residentName: action.residentName,
              residentEmail: residentEmail || null,
              residentPhone: from,
              said: action.forwardSaid,
              wants: action.classification.wantsLabel,
              domain: action.classification.domain,
              managerPath: action.classification.managerPath,
              autoFiledNote: action.autoFiledNote,
              propertyLabel: action.propertyLabel,
              reply: action.residentReply,
            });

        const tasks: Promise<unknown>[] = [];
        if (brief) {
          tasks.push(
            forwardResidentMessageToManagers({
              fromResident: from,
              text,
              thread: threadRef,
              briefText: brief,
            }),
          );
          tasks.push(
            mirrorResidentTextToManagerInbox({
              thread: threadRef,
              from,
              text,
              service: args.service,
              subject: `${action.propertyLabel ? `${action.propertyLabel} · ` : ""}${action.residentName}`,
              body: brief,
            }),
          );
        }
        if (action.threadTopic !== threadRef.topic) {
          tasks.push(
            openClawResidentThread({
              managerUserId: threadRef.managerUserId,
              residentPhone: from,
              residentUserId,
              residentEmail: residentEmail || null,
              topic: action.threadTopic,
            }),
          );
        }
        await Promise.all(tasks);
      });

      return {
        ok: send.ok,
        intent: "unknown",
        replied: send.ok,
        error: send.ok ? undefined : send.error,
      };
    }
  }

  const intent = classifyLeasingIntent(text);
  const origin = publicAppOrigin();
  const managers = await resolveMappedManagers();
  const hintId = extractPropertyIdHint(text);
  let bundleId = extractBundleIdHint(text);
  const hinted =
    (await resolvePropertyHint(hintId, managers)) ??
    (await resolvePropertyByLabelHint(extractPropertyLabelHint(text), managers));
  const propertyId = hinted?.propertyId || managers[0]?.defaultPropertyId || null;
  const propertyLabel =
    hinted?.propertyLabel || managers[0]?.defaultPropertyLabel || null;
  if (!bundleId) {
    bundleId = await resolveBundleIdByLabel(propertyId, extractBundleLabelHint(text));
  }

  await registerClawMessengerRoute(from);

  const reply = replyForIntent({ intent, origin, propertyId, propertyLabel, bundleId });
  const send = await sendClawMessengerText({ to: from, text: reply });
  if (!send.ok) {
    return { ok: false, intent, replied: false, error: send.error || "Send failed." };
  }

  const intentLabel =
    intent === "tour" || intent === "tour_details"
      ? "tour request"
      : intent === "apply" || intent === "bundle"
        ? "application request"
        : intent === "question"
          ? "question"
          : "leasing message";
  const subjectLabel =
    intent === "tour" || intent === "tour_details"
      ? "Tour request"
      : intent === "apply" || intent === "bundle"
        ? "Application"
        : intent === "question"
          ? "Question"
          : "Text";

  runAfterReply(async () => {
    const db = createSupabaseServiceRoleClient();
    await Promise.all([
      forwardClawInboundToManagers({
        fromResident: from,
        text,
        intentLabel,
        propertyLabel,
        managerUserId: managers[0]?.userId ?? null,
      }),
      ...managers.map((manager) =>
        upsertManagerInboxNotice(db, {
          managerUserId: manager.userId,
          idPrefix: "claw_lease",
          threadType: "claw_leasing_sms",
          from: from,
          subject: `(${subjectLabel}${propertyLabel ? ` — ${propertyLabel}` : ""}) ${from}`,
          preview: text.slice(0, 140) || "(empty)",
          body: [
            `(${subjectLabel}${propertyLabel ? ` — ${propertyLabel}` : ""}) ${from}`,
            "",
            text || "(empty message)",
            "",
            `— Auto-replied (${intent}) —`,
            reply,
          ].join("\n"),
          unread: true,
        }),
      ),
    ]);
  });

  return { ok: true, intent, replied: true };
}

/**
 * Stamp the shared Claw leasing number onto a manager profile so outbound copy
 * and listing CTAs stay aligned. Does not buy a Twilio number.
 */
export async function assignSharedClawLeasingNumberToManager(
  userId: string,
  opts?: { force?: boolean },
): Promise<void> {
  const uid = userId.trim();
  if (!uid) return;
  const assignFlag = process.env.CLAW_MESSENGER_ASSIGN_SHARED_NUMBER?.trim();
  const configured = Boolean(process.env.CLAW_MESSENGER_API_KEY?.trim());
  if (assignFlag === "0" || assignFlag === "false") return;
  if (!configured && assignFlag !== "1" && assignFlag !== "true") return;

  const phone = clawLeasingAgentPhoneE164();
  const db = createSupabaseServiceRoleClient();
  let q = db
    .from("profiles")
    .update({
      sms_from_number: phone,
      updated_at: new Date().toISOString(),
    })
    .eq("id", uid);
  if (!opts?.force) q = q.is("sms_from_number", null);
  await q;
}

export async function assignSharedClawLeasingNumberIfMapped(userId: string, email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;
  if (!clawMappedManagerEmails().includes(normalized)) return;
  await assignSharedClawLeasingNumberToManager(userId);
}
