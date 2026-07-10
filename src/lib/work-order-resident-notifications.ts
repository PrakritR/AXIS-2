import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";

type WorkOrderUpdateKind = "vendor_assigned" | "visit_scheduled";

type SendResult = { ok: boolean; skipped?: boolean; error?: string };

export function buildResidentWorkOrderUpdate(
  kind: WorkOrderUpdateKind,
  row: DemoManagerWorkOrderRow,
  extras?: { scheduledLabel?: string },
): { subject: string; text: string } {
  const title = row.title?.trim() || "Work order";

  if (kind === "vendor_assigned") {
    const vendorName = row.vendorName?.trim() || "A vendor";
    return {
      subject: `Update on "${title}": vendor assigned`,
      text: `${vendorName} has been assigned to your work order "${title}". They'll be in touch to schedule a visit.`,
    };
  }

  const scheduledLabel = extras?.scheduledLabel?.trim() || row.scheduled || "soon";
  return {
    subject: `Update on "${title}": visit scheduled for ${scheduledLabel}`,
    text: `Your work order "${title}" has a visit scheduled for ${scheduledLabel}.`,
  };
}

export async function notifyResidentOfWorkOrderUpdate(
  kind: WorkOrderUpdateKind,
  row: DemoManagerWorkOrderRow,
  extras?: { scheduledLabel?: string },
): Promise<SendResult> {
  const residentEmail = row.residentEmail?.trim();
  if (!residentEmail) return { ok: false, skipped: true };

  const { subject, text } = buildResidentWorkOrderUpdate(kind, row, extras);
  try {
    const response = await fetch("/api/portal/send-inbox-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        toEmails: [residentEmail],
        subject,
        text,
        deliverToPortalInbox: true,
        deliverViaEmail: false,
        fromName: "Axis Portal",
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as SendResult;
    if (!response.ok || !payload.ok) {
      return { ok: false, error: payload.error ?? "Notification delivery failed." };
    }
    return payload;
  } catch {
    return { ok: false, error: "Notification delivery failed." };
  }
}
