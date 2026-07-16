/**
 * Leasing SMS/iMessage auto-replies for the shared Claw Messenger agent line.
 *
 * Residents text the agent number about tours / applications / leases; we reply
 * with deep links (apply) or intake questions (tour) and mirror the thread into
 * the mapped manager's Axis inbox.
 */

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

/** Emails whose leasing contact is the shared Claw agent line (prod + test). */
export function clawMappedManagerEmails(): string[] {
  const fromEnv = (process.env.CLAW_MESSENGER_MANAGER_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (fromEnv.length > 0) return fromEnv;
  return ["ogambik2@gmail.com", "testeverything@test.axis.local"];
}

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
      .eq("status", "listed")
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

async function resolvePropertyHint(propertyId: string | null): Promise<PropertyHint | null> {
  const id = propertyId?.trim();
  if (!id) return null;
  const db = createSupabaseServiceRoleClient();
  const { data } = await db
    .from("manager_property_records")
    .select("id, property_data")
    .eq("id", id)
    .maybeSingle();
  if (!data) return { propertyId: id, propertyLabel: null };
  const pd = (data as { property_data?: { title?: string; address?: string; buildingName?: string } | null })
    .property_data;
  const label = pd?.buildingName?.trim() || pd?.title?.trim() || pd?.address?.trim() || null;
  return { propertyId: id, propertyLabel: label };
}

function propertyDisplayLabel(pd: { title?: string; address?: string; buildingName?: string } | null | undefined): string {
  return pd?.buildingName?.trim() || pd?.title?.trim() || pd?.address?.trim() || "";
}

async function resolvePropertyByLabelHint(labelHint: string | null): Promise<PropertyHint | null> {
  const needle = (labelHint ?? "").trim().toLowerCase();
  if (!needle) return null;
  const managers = await resolveMappedManagers();
  if (managers.length === 0) return null;
  const db = createSupabaseServiceRoleClient();
  const { data } = await db
    .from("manager_property_records")
    .select("id, property_data, manager_user_id, status")
    .in(
      "manager_user_id",
      managers.map((m) => m.userId),
    )
    .eq("status", "listed")
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
  const payments = residentPortalUrl("payments");

  switch (intent) {
    case "tour":
      return [
        `Great — I can help schedule a tour${where}.`,
        ``,
        `Reply with these details (one message is fine):`,
        `1) Your full name`,
        `2) Email`,
        `3) Phone (if different from this number)`,
        `4) A few date/time options that work (e.g. Thu 5pm or Sat morning)`,
        `5) Room preference, or "not sure yet"`,
        `6) Anything we should know (pets, parking, questions)`,
        ``,
        `Once we have that, the manager will confirm a time.`,
        `Want to apply meanwhile? Text APPLY or tap Text to apply on the listing.`,
      ].join("\n");
    case "tour_details":
      return [
        `Thanks — we received your tour details${where} and forwarded them to the property manager.`,
        `You'll get a confirmation once a time is locked in.`,
        `Ready to apply? ${apply}`,
      ].join("\n");
    case "apply":
      return [
        `Perfect — here's your application link${where}:`,
        apply,
        ``,
        `If you still want a tour first, text TOUR and I'll ask a few scheduling questions.`,
        `New to PropLane? ${signup}`,
      ].join("\n");
    case "bundle":
      return [
        `Perfect — here's your bundle application link${where}:`,
        apply,
        ``,
        `Open the link to finish the application. Questions about the bundle? Just reply here — the manager will text you back.`,
      ].join("\n");
    case "question":
      return [
        `Thanks — your message was forwarded to the property manager${where}.`,
        `They'll reply on this same thread by iMessage or SMS.`,
        `Need an application link in the meantime? Text APPLY.`,
        `Want a tour? Text TOUR.`,
      ].join("\n");
    case "lease":
      return [
        `Lease signing is in your resident portal:`,
        leasePortal,
        `Payments: ${payments}`,
        `Need an account first? ${signup}`,
      ].join("\n");
    case "greeting":
    case "help":
      return [
        `PropLane leasing assistant${where ? ` (${propertyLabel})` : ""}.`,
        `Text TOUR to schedule a showing (I'll ask a few questions).`,
        `Text APPLY for the application link.`,
        `Text LEASE for lease signing / resident setup.`,
        `Payments: ${payments}`,
        `Or just send your question — a manager will reply here by text.`,
        propertyId ? `Listing: ${listing}` : `Browse: ${origin}/rent`,
      ].join("\n");
    default:
      return [
        `Thanks for texting PropLane${where}.`,
        `A manager will reply on this thread. Or text TOUR / APPLY for quick links.`,
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

  const text = (args.text ?? "").trim();

  // Manager typing from their personal phone → relay to last resident thread.
  // Exception: listing CTA bodies still run the leasing bot.
  if ((await isMappedManagerPhone(from)) && !looksLikeProspectLeasingCta(text)) {
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
    let thread = await findThreadByResidentPhone(from);
    if (!thread) {
      const resident = await findResidentProfileByPhone(from);
      if (resident?.managerUserId) {
        thread = await openClawResidentThread({
          managerUserId: resident.managerUserId,
          residentPhone: from,
          residentUserId: resident.userId,
          residentEmail: resident.email,
          topic: "general",
        });
      }
    }
    if (thread) {
      await registerClawMessengerRoute(from);
      const profile = await findResidentProfileByPhone(from);
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

      const send = await sendClawMessengerText({ to: from, text: action.residentReply });

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
          });

      if (brief) {
        await forwardResidentMessageToManagers({
          fromResident: from,
          text,
          topicLabel: action.classification.domain,
          thread,
          briefText: brief,
        });
        await mirrorResidentTextToManagerInbox({
          thread,
          from,
          text,
          service: args.service,
          subject: `${action.classification.domain}: ${action.classification.wantsLabel}`,
          body: brief,
        });
      }

      if (action.threadTopic !== thread.topic) {
        await openClawResidentThread({
          managerUserId: thread.managerUserId,
          residentPhone: from,
          residentUserId,
          residentEmail: residentEmail || null,
          topic: action.threadTopic,
        });
      }

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
    (await resolvePropertyHint(hintId)) ??
    (await resolvePropertyByLabelHint(extractPropertyLabelHint(text)));
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

  await forwardClawInboundToManagers({
    fromResident: from,
    text,
    intentLabel,
    propertyLabel,
    managerUserId: managers[0]?.userId ?? null,
  });

  const db = createSupabaseServiceRoleClient();
  for (const manager of managers) {
    await upsertManagerInboxNotice(db, {
      managerUserId: manager.userId,
      idPrefix: "claw_lease",
      threadType: "claw_leasing_sms",
      from: from,
      subject:
        intent === "tour" || intent === "tour_details"
          ? `Tour text from ${from}`
          : intent === "apply" || intent === "bundle"
            ? `Apply text from ${from}`
            : intent === "question"
              ? `Question text from ${from}`
              : `Text from ${from}`,
      preview: text.slice(0, 140) || "(empty)",
      body: [
        `Inbound (${args.service || "iMessage/SMS"}) from ${from}`,
        args.messageId ? `Message id: ${args.messageId}` : null,
        propertyId ? `Property: ${propertyLabel || propertyId}` : null,
        bundleId ? `Bundle: ${bundleId}` : null,
        "",
        text || "(empty message)",
        "",
        `— Auto-replied (${intent}) —`,
        reply,
        "",
        "— Also forwarded to your personal phone via Claw (reply there to text them back) —",
      ]
        .filter((line) => line !== null)
        .join("\n"),
      unread: true,
    });
  }

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
