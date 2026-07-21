/**
 * Claw two-way relay helpers (compatibility surface).
 * Implementation lives in `claw-resident-messaging.server.ts` (durable DB threads).
 */

export {
  clawDefaultResidentPhoneFromEnv,
  clawManagerForwardPhonesFromEnv,
  findLatestThreadForManagerPhone,
  findThreadByResidentPhone,
  forwardResidentMessageToManagers,
  isMappedManagerPhone,
  labelClawSmsFromManager,
  labelClawSmsFromPropLaneForManager,
  labelClawSmsFromResident,
  mirrorAutomatedResidentSmsToManager,
  openClawResidentThread,
  resolveMappedManagerContacts,
  resolveOrCreateThreadForManagerPhone,
  tryRelayManagerReplyViaClaw,
  type ClawThreadTopic,
} from "@/lib/claw-resident-messaging.server";

import {
  clawLeasingAgentPhoneE164,
  normalizeE164Us,
} from "@/lib/claw-messenger.server";
import {
  clawManagerForwardPhonesFromEnv,
  isMappedManagerPhone,
  openClawResidentThread,
  resolveMappedManagerContacts,
} from "@/lib/claw-resident-messaging.server";

export function clawAgentPhoneE164(): string {
  return clawLeasingAgentPhoneE164();
}

/**
 * Forward prospect/leasing inbound to managers' personal phones and open a
 * durable relay thread (leasing topic).
 */
export async function forwardClawInboundToManagers(args: {
  fromResident: string;
  text: string;
  intentLabel: string;
  propertyLabel?: string | null;
  managerUserId?: string | null;
  workNumber?: string | null;
  /** What PropLane replied to the prospect (included in the manager SMS). */
  autoReply?: string | null;
}): Promise<{ forwardedTo: string[] }> {
  const fromResident = normalizeE164Us(args.fromResident) ?? args.fromResident;
  if (await isMappedManagerPhone(fromResident)) {
    return { forwardedTo: [] };
  }

  const managers = await resolveMappedManagerContacts();
  const envPhones = clawManagerForwardPhonesFromEnv();
  const targets = new Set<string>();

  // Always include configured forward phones (trial / ops cell).
  for (const p of envPhones) targets.add(p);

  // Owning manager's personal phone (Twilio work-number or mapped Claw landlord).
  if (args.managerUserId) {
    const owner = managers.find((m) => m.userId === args.managerUserId);
    if (owner?.personalPhone) targets.add(owner.personalPhone);
    try {
      const { createSupabaseServiceRoleClient } = await import("@/lib/supabase/service");
      const db = createSupabaseServiceRoleClient();
      const { data } = await db
        .from("profiles")
        .select("phone, phone_verified_at, sms_forward_inbound")
        .eq("id", args.managerUserId)
        .maybeSingle();
      const phone = normalizeE164Us(String((data as { phone?: unknown } | null)?.phone ?? ""));
      const forward = (data as { sms_forward_inbound?: unknown } | null)?.sms_forward_inbound !== false;
      // Prefer verified phones, but still forward when a number is on file and
      // forwarding isn't opted out — otherwise leasing alerts never reach the manager.
      if (phone && forward) targets.add(phone);
    } catch {
      /* skip */
    }
  }
  // No `managerUserId` means the caller never resolved an owner for this
  // conversation — do NOT fall back to broadcasting to every registered
  // manager's personal phone. That was a harmless fallback when the roster
  // was a 2-3 account trial allowlist; now that it's DB-driven over every
  // real manager, it would leak one prospect's text to the whole platform's
  // managers. Every current caller always passes `managerUserId`, so this is
  // a defensive no-broadcast default, not a behavior change in practice.
  targets.delete(fromResident);
  targets.delete(clawLeasingAgentPhoneE164());

  const label = args.intentLabel.trim()
    ? args.intentLabel.trim().charAt(0).toUpperCase() + args.intentLabel.trim().slice(1)
    : "Leasing message";
  const where = args.propertyLabel?.trim() ? ` — ${args.propertyLabel.trim()}` : "";
  const reply = (args.autoReply ?? "").trim();
  const body = [
    `(${label}${where}) ${fromResident}`,
    args.text || "(empty)",
    reply ? `\n— PropLane replied —\n${reply}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const { sendFromManagerWorkNumber, sendPropLaneSms } = await import(
    "@/lib/proplane-sms-transport.server"
  );
  const sent = await Promise.all(
    [...targets].map(async (to) => {
      const send = args.managerUserId
        ? await sendFromManagerWorkNumber({
            managerUserId: args.managerUserId,
            to,
            text: body,
            fromNumber: args.workNumber,
            skipLog: true,
          })
        : await sendPropLaneSms({ to, text: body, fromNumber: args.workNumber, log: null });
      return send.ok ? to : null;
    }),
  );
  const forwardedTo = sent.filter((t): t is string => Boolean(t));

  const primary =
    (args.managerUserId
      ? managers.find((m) => m.userId === args.managerUserId)
      : null) ??
    managers.find((m) => m.personalPhone) ??
    managers[0];
  const threadManagerId = args.managerUserId || primary?.userId;
  if (threadManagerId) {
    await openClawResidentThread({
      managerUserId: threadManagerId,
      residentPhone: fromResident,
      topic: "leasing",
    });
  }

  return { forwardedTo };
}
