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
}): Promise<{ forwardedTo: string[] }> {
  const fromResident = normalizeE164Us(args.fromResident) ?? args.fromResident;
  if (await isMappedManagerPhone(fromResident)) {
    return { forwardedTo: [] };
  }

  const managers = await resolveMappedManagerContacts();
  const envPhones = clawManagerForwardPhonesFromEnv();
  const targets = new Set<string>();

  // Prefer the owning manager's personal phone when scoped (Twilio work number).
  if (args.managerUserId) {
    const owner = managers.find((m) => m.userId === args.managerUserId);
    if (owner?.personalPhone) targets.add(owner.personalPhone);
    else {
      // Look up personal phone directly when not in the legacy mapped list.
      try {
        const { createSupabaseServiceRoleClient } = await import("@/lib/supabase/service");
        const db = createSupabaseServiceRoleClient();
        const { data } = await db
          .from("profiles")
          .select("phone, phone_verified_at, sms_forward_inbound")
          .eq("id", args.managerUserId)
          .maybeSingle();
        const phone = normalizeE164Us(String((data as { phone?: unknown } | null)?.phone ?? ""));
        const verified = Boolean((data as { phone_verified_at?: unknown } | null)?.phone_verified_at);
        const forward = (data as { sms_forward_inbound?: unknown } | null)?.sms_forward_inbound !== false;
        if (phone && verified && forward) targets.add(phone);
      } catch {
        /* skip */
      }
    }
  } else {
    for (const p of envPhones) targets.add(p);
    for (const m of managers) {
      if (m.personalPhone) targets.add(m.personalPhone);
    }
  }
  targets.delete(fromResident);
  targets.delete(clawLeasingAgentPhoneE164());

  const label = args.intentLabel.trim()
    ? args.intentLabel.trim().charAt(0).toUpperCase() + args.intentLabel.trim().slice(1)
    : "Leasing message";
  const where = args.propertyLabel?.trim() ? ` — ${args.propertyLabel.trim()}` : "";
  const body = [`(${label}${where}) ${fromResident}`, args.text || "(empty)"].join("\n");

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
          })
        : await sendPropLaneSms({ to, text: body, fromNumber: args.workNumber });
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
