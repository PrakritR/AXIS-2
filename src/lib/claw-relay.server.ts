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

  const where = args.propertyLabel ? ` (${args.propertyLabel})` : "";
  const body = [
    `From prospect${where}:`,
    args.text || "(empty)",
    "",
    `(${args.intentLabel}) Reply in this thread to text them back.`,
  ].join("\n");

  const forwardedTo: string[] = [];
  for (const to of targets) {
    await registerClawMessengerRoute(to);
    const send = await sendClawMessengerText({ to, text: body });
    if (send.ok) forwardedTo.push(to);
  }

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
