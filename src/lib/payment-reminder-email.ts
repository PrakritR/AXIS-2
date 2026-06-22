import type { PaymentReminderSlot } from "@/lib/payment-policy";

export const PAYMENT_REMINDER_SUBJECTS: Record<PaymentReminderSlot, (title: string) => string> = {
  "7d": (title) => `Payment due in 7 days: ${title}`,
  "5d": (title) => `Payment due in 5 days: ${title}`,
  "3d": (title) => `Payment due in 3 days: ${title}`,
  "12h": (title) => `Payment due today: ${title}`,
  overdue_daily: (title) => `Overdue payment reminder: ${title}`,
};

type Params = {
  slot: PaymentReminderSlot;
  residentName: string;
  chargeTitle: string;
  balanceDue: string;
  propertyLabel: string;
  managerName: string;
  dueDateLabel: string;
};

function timingLabel(slot: PaymentReminderSlot): string {
  switch (slot) {
    case "7d":
      return "in 7 days";
    case "5d":
      return "in 5 days";
    case "3d":
      return "in 3 days";
    case "12h":
      return "today";
    case "overdue_daily":
      return "now — this payment is overdue";
    default:
      return "soon";
  }
}

export function buildPaymentReminderText(p: Params): string {
  const timing = timingLabel(p.slot);
  const lines = [
    `Hi ${p.residentName},`,
    "",
    `This is an automated reminder that your ${p.chargeTitle} payment is due ${timing}${p.dueDateLabel ? ` (${p.dueDateLabel})` : ""}.`,
    "",
    `Amount due: ${p.balanceDue}`,
    p.propertyLabel ? `Property: ${p.propertyLabel}` : null,
    "",
    p.slot === "overdue_daily"
      ? "Please submit payment as soon as possible to avoid additional late fees."
      : "Please log in to your Axis resident portal to make your payment at your earliest convenience.",
    "",
    "If you have any questions, please don't hesitate to reach out.",
    "",
    p.managerName,
    "Axis Portal",
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}

export function buildPaymentReminderHtml(p: Params): string {
  const timing = timingLabel(p.slot);
  const rows = [
    `<p>Hi ${p.residentName},</p>`,
    `<p>This is an automated reminder that your <strong>${p.chargeTitle}</strong> payment is due <strong>${timing}</strong>${p.dueDateLabel ? ` (${p.dueDateLabel})` : ""}.</p>`,
    `<p><strong>Amount due:</strong> ${p.balanceDue}</p>`,
    p.propertyLabel ? `<p><strong>Property:</strong> ${p.propertyLabel}</p>` : null,
    `<p>${p.slot === "overdue_daily" ? "Please submit payment as soon as possible to avoid additional late fees." : "Please log in to your Axis resident portal to make your payment at your earliest convenience."}</p>`,
    `<p>If you have any questions, please don't hesitate to reach out.</p>`,
    `<p>${p.managerName}<br>Axis Portal</p>`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">\n${rows}\n</body></html>`;
}

export function buildLateFeeNoticeText(input: {
  residentName: string;
  sourceTitle: string;
  lateFeeLabel: string;
  graceDays: number;
  propertyLabel: string;
  managerName: string;
}): string {
  return [
    `Hi ${input.residentName},`,
    "",
    `A late payment fee of ${input.lateFeeLabel} has been added because ${input.sourceTitle} is more than ${input.graceDays} day${input.graceDays === 1 ? "" : "s"} past due.`,
    input.propertyLabel ? `Property: ${input.propertyLabel}` : null,
    "",
    "Please log in to your Axis resident portal to review and pay the updated balance.",
    "",
    input.managerName,
    "Axis Portal",
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}
