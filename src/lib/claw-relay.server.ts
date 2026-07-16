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
  registerClawMessengerRoute,
  sendClawMessengerText,
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
}): Promise<{ forwardedTo: string[] }> {
  const fromResident = normalizeE164Us(args.fromResident) ?? args.fromResident;
  if (await isMappedManagerPhone(fromResident)) {
    return { forwardedTo: [] };
  }

  const managers = await resolveMappedManagerContacts();
  const envPhones = clawManagerForwardPhonesFromEnv();
  const targets = new Set<string>();
  for (const p of envPhones) targets.add(p);
  for (const m of managers) {
    if (m.personalPhone) targets.add(m.personalPhone);
  }
  targets.delete(fromResident);
  targets.delete(clawLeasingAgentPhoneE164());

  const label = args.intentLabel.trim()
    ? args.intentLabel.trim().charAt(0).toUpperCase() + args.intentLabel.trim().slice(1)
    : "Leasing message";
  const where = args.propertyLabel?.trim() ? ` — ${args.propertyLabel.trim()}` : "";
  const body = [`(${label}${where}) ${fromResident}`, args.text || "(empty)"].join("\n");

  const sent = await Promise.all(
    [...targets].map(async (to) => {
      await registerClawMessengerRoute(to);
      const send = await sendClawMessengerText({ to, text: body });
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
  if (primary?.userId) {
    await openClawResidentThread({
      managerUserId: primary.userId,
      residentPhone: fromResident,
      topic: "leasing",
    });
  }

  return { forwardedTo };
}
