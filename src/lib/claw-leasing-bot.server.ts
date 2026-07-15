/**
 * Leasing SMS/iMessage auto-replies for the shared Claw Messenger agent line.
 *
 * Residents text the agent number about tours / applications / leases; we reply
 * with deep links and mirror the thread into the mapped manager's Axis inbox.
 */

import {
  buildManagerApplyUrl,
  buildManagerListingUrl,
  buildManagerTourUrl,
} from "@/lib/manager-property-links";
import {
  classifyLeasingIntent,
  extractPropertyIdHint,
  type LeasingIntent,
} from "@/lib/claw-leasing-links";
import {
  clawLeasingAgentPhoneE164,
  normalizeE164Us,
  registerClawMessengerRoute,
  sendClawMessengerText,
} from "@/lib/claw-messenger.server";
import { upsertManagerInboxNotice } from "@/lib/sms-inbox-notice.server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export {
  buildSmsDeepLink,
  classifyLeasingIntent,
  extractPropertyIdHint,
  type LeasingIntent,
} from "@/lib/claw-leasing-links";

/** Emails whose leasing contact is the shared Claw agent line (prod + test). */
export function clawMappedManagerEmails(): string[] {
  const fromEnv = (process.env.CLAW_MESSENGER_MANAGER_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (fromEnv.length > 0) return fromEnv;
  // Defaults: production manager + local all-portals sandbox.
  return ["ogambik2@gmail.com", "testeverything@test.axis.local"];
}

export function publicAppOrigin(): string {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (production ? `https://${production}` : "") ||
    "https://www.axis-seattle-housing.com"
  ).replace(/\/$/, "");
}

type ManagerTarget = {
  userId: string;
  email: string;
  fullName: string | null;
  defaultPropertyId: string | null;
  defaultPropertyLabel: string | null;
};

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

function replyForIntent(args: {
  intent: LeasingIntent;
  origin: string;
  propertyId: string | null;
  propertyLabel: string | null;
}): string {
  const { intent, origin, propertyId, propertyLabel } = args;
  const where = propertyLabel ? ` for ${propertyLabel}` : "";
  const tour = propertyId ? buildManagerTourUrl(origin, propertyId) : `${origin}/rent`;
  const apply = propertyId ? buildManagerApplyUrl(origin, { propertyId }) : `${origin}/rent/apply`;
  const listing = propertyId ? buildManagerListingUrl(origin, propertyId) : `${origin}/rent`;
  const leasePortal = `${origin}/resident/leases`;
  const signup = `${origin}/auth/resident-setup`;

  switch (intent) {
    case "tour":
      return [
        `Happy to help with a tour${where}.`,
        `Schedule here: ${tour}`,
        propertyId ? `Listing: ${listing}` : null,
        `Reply APPLY when you're ready to start an application.`,
      ]
        .filter(Boolean)
        .join("\n");
    case "apply":
      return [
        `Great — start your application${where} here:`,
        apply,
        `If you still need a tour first: ${tour}`,
        `New to PropLane? Create your resident account: ${signup}`,
      ].join("\n");
    case "lease":
      return [
        `Lease signing is in your resident portal:`,
        leasePortal,
        `Need an account first? ${signup}`,
        `Questions about move-in or payments — just text us here.`,
      ].join("\n");
    case "greeting":
    case "help":
      return [
        `PropLane leasing assistant — text one of these:`,
        `TOUR — schedule a showing${where}`,
        `APPLY — start a rental application`,
        `LEASE — open lease signing / resident setup`,
        propertyId ? `Listing: ${listing}` : `Browse homes: ${origin}/rent`,
      ].join("\n");
    default:
      return [
        `Thanks for texting PropLane.`,
        `Reply TOUR, APPLY, or LEASE and I'll send the right link${where}.`,
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
 * Process one inbound Claw Messenger text: register contact, auto-reply with
 * leasing links, mirror into each mapped manager inbox.
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
  const intent = classifyLeasingIntent(text);
  const origin = publicAppOrigin();
  const managers = await resolveMappedManagers();
  const hintId = extractPropertyIdHint(text);
  const propertyId = hintId || managers[0]?.defaultPropertyId || null;
  const propertyLabel = managers[0]?.defaultPropertyLabel || null;

  await registerClawMessengerRoute(from);

  const reply = replyForIntent({ intent, origin, propertyId, propertyLabel });
  const send = await sendClawMessengerText({ to: from, text: reply });
  if (!send.ok) {
    return { ok: false, intent, replied: false, error: send.error || "Send failed." };
  }

  const db = createSupabaseServiceRoleClient();
  for (const manager of managers) {
    await upsertManagerInboxNotice(db, {
      managerUserId: manager.userId,
      idPrefix: "claw_lease",
      threadType: "claw_leasing_sms",
      from: from,
      subject: `Text from ${from}`,
      preview: text.slice(0, 140) || "(empty)",
      body: [
        `Inbound (${args.service || "iMessage/SMS"}) from ${from}`,
        args.messageId ? `Message id: ${args.messageId}` : null,
        "",
        text || "(empty message)",
        "",
        `— Auto-replied (${intent}) —`,
        reply,
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
 *
 * Only writes when Claw is configured (`CLAW_MESSENGER_API_KEY`) or
 * `CLAW_MESSENGER_ASSIGN_SHARED_NUMBER=1`. Skips if a work number is already set
 * unless `force` is true.
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
