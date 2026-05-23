export const PAYMENT_REMINDER_SUBJECTS: Record<"3d" | "12h", (title: string) => string> = {
  "3d": (title) => `Payment due in 3 days: ${title}`,
  "12h": (title) => `Payment due today: ${title}`,
};

type Params = {
  slot: "3d" | "12h";
  residentName: string;
  chargeTitle: string;
  balanceDue: string;
  propertyLabel: string;
  managerName: string;
  dueDateLabel: string;
};

export function buildPaymentReminderText(p: Params): string {
  const timing = p.slot === "3d" ? "in 3 days" : "today";
  return [
    `Hi ${p.residentName},`,
    "",
    `This is an automated reminder that your ${p.chargeTitle} payment is due ${timing} (${p.dueDateLabel}).`,
    "",
    `Amount due: ${p.balanceDue}`,
    p.propertyLabel ? `Property: ${p.propertyLabel}` : null,
    "",
    "Please log in to your Axis resident portal to make your payment at your earliest convenience.",
    "",
    "If you have any questions, please don't hesitate to reach out.",
    "",
    p.managerName,
    "Axis Housing Portal",
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

export function buildPaymentReminderHtml(p: Params): string {
  const timing = p.slot === "3d" ? "in 3 days" : "today";
  const rows = [
    `<p>Hi ${p.residentName},</p>`,
    `<p>This is an automated reminder that your <strong>${p.chargeTitle}</strong> payment is due <strong>${timing}</strong> (${p.dueDateLabel}).</p>`,
    `<p><strong>Amount due:</strong> ${p.balanceDue}</p>`,
    p.propertyLabel ? `<p><strong>Property:</strong> ${p.propertyLabel}</p>` : null,
    `<p>Please log in to your Axis resident portal to make your payment at your earliest convenience.</p>`,
    `<p>If you have any questions, please don't hesitate to reach out.</p>`,
    `<p>${p.managerName}<br>Axis Housing Portal</p>`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">\n${rows}\n</body></html>`;
}
