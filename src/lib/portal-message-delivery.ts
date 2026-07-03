/** Client helper — deliver to Axis inbox and email (when configured). */

export type PortalMessageDeliveryResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
};

export async function deliverPortalInboxMessage(input: {
  fromName?: string;
  toEmails?: string[];
  /** Resolve recipients from the sender's own relationships instead of explicit emails (e.g. a resident messaging "their manager"). */
  toBroadcast?: ("management" | "resident")[];
  subject: string;
  text: string;
}): Promise<PortalMessageDeliveryResult> {
  const toEmails = (input.toEmails ?? []).map((e) => e.trim()).filter((e) => e.includes("@"));
  if (toEmails.length === 0 && !input.toBroadcast?.length) {
    return { ok: false, error: "A valid recipient email is required." };
  }
  try {
    const res = await fetch("/api/portal/send-inbox-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        fromName: input.fromName ?? "Property Manager",
        toEmails,
        toBroadcast: input.toBroadcast,
        subject: input.subject.trim(),
        text: input.text.trim(),
        deliverToPortalInbox: true,
        deliverViaEmail: true,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; skipped?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? "Could not deliver message." };
    }
    return { ok: true, skipped: data.skipped };
  } catch {
    return { ok: false, error: "Could not deliver message." };
  }
}

export function buildNewChargeNoticeBody(input: {
  residentName: string;
  chargeTitle: string;
  amountLabel: string;
  dueDateLabel?: string;
  propertyLabel?: string;
}): string {
  const lines = [
    `Hi ${input.residentName || "there"},`,
    "",
    "A new charge has been added to your Axis resident portal:",
    "",
    `${input.chargeTitle} — ${input.amountLabel}`,
  ];
  if (input.dueDateLabel?.trim()) lines.push(`Due: ${input.dueDateLabel.trim()}`);
  if (input.propertyLabel?.trim()) lines.push(`Property: ${input.propertyLabel.trim()}`);
  lines.push(
    "",
    "Please sign in to your Axis resident portal to review and pay at your earliest convenience.",
    "",
    "If you have any questions, reply in your Axis inbox and we will help.",
    "",
    "Axis",
  );
  return lines.join("\n");
}
