import type { PaymentReminderKind } from "@/lib/payment-automation-settings";
import type { ManagerAutomationSettings, ScheduledMessageOverride } from "@/lib/payment-automation-settings";
import { DEFAULT_MANAGER_AUTOMATION_SETTINGS } from "@/lib/payment-automation-settings";

/** @deprecated Use PaymentReminderKind + daysBeforeDue instead. */
export type PaymentReminderSlot = "7d" | "5d" | "3d" | "12h" | "overdue_daily";

export const PAYMENT_REMINDER_SUBJECTS: Record<PaymentReminderSlot, (title: string) => string> = {
  "7d": (title) => `Payment due in 7 days: ${title}`,
  "5d": (title) => `Payment due in 5 days: ${title}`,
  "3d": (title) => `Payment due in 3 days: ${title}`,
  "12h": (title) => `Payment due today: ${title}`,
  overdue_daily: (title) => `Overdue payment reminder: ${title}`,
};

export type ReminderTemplateParams = {
  residentName: string;
  chargeTitle: string;
  balanceDue: string;
  propertyLabel: string;
  managerName: string;
  dueDateLabel: string;
  daysUntilDue: number;
  lateFeeAmount?: string;
  graceDays?: number;
};

export function applyReminderTemplate(template: string, params: ReminderTemplateParams): string {
  const propertyLabel = (params.propertyLabel ?? "").trim();
  const propertyLine = propertyLabel ? `Property: ${propertyLabel}` : "";
  const daysLabel =
    params.daysUntilDue === 0
      ? "today"
      : params.daysUntilDue === 1
        ? "1 day"
        : params.daysUntilDue < 0
          ? `${Math.abs(params.daysUntilDue)} day(s) ago`
          : `${params.daysUntilDue} days`;

  return template
    .replaceAll("{residentName}", params.residentName)
    .replaceAll("{chargeTitle}", params.chargeTitle)
    .replaceAll("{balanceDue}", params.balanceDue)
    .replaceAll("{propertyLabel}", params.propertyLabel)
    .replaceAll("{propertyLine}", propertyLine)
    .replaceAll("{managerName}", params.managerName)
    .replaceAll("{dueDate}", params.dueDateLabel)
    .replaceAll("{daysUntilDue}", daysLabel)
    .replaceAll("{lateFeeAmount}", params.lateFeeAmount ?? "")
    .replaceAll("{graceDays}", String(params.graceDays ?? ""))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildReminderContent(input: {
  kind: PaymentReminderKind;
  daysBeforeDue?: number;
  settings?: ManagerAutomationSettings;
  override?: ScheduledMessageOverride;
  params: ReminderTemplateParams;
}): { subject: string; body: string } {
  const settings = input.settings ?? DEFAULT_MANAGER_AUTOMATION_SETTINGS;
  const template =
    input.kind === "overdue_daily"
      ? settings.templates.overdue
      : input.kind === "late_fee"
        ? settings.templates.lateFee
        : settings.templates.preDue;

  const subject = applyReminderTemplate(input.override?.customSubject ?? template.subject, input.params);
  const body = applyReminderTemplate(input.override?.customBody ?? template.body, input.params);
  return { subject, body };
}

type LegacyParams = {
  slot: PaymentReminderSlot;
  residentName: string;
  chargeTitle: string;
  balanceDue: string;
  propertyLabel: string;
  managerName: string;
  dueDateLabel: string;
};

function legacyDaysUntilDue(slot: PaymentReminderSlot): number {
  if (slot === "7d") return 7;
  if (slot === "5d") return 5;
  if (slot === "3d") return 3;
  if (slot === "12h") return 0;
  return -1;
}

function legacyKind(slot: PaymentReminderSlot): PaymentReminderKind {
  if (slot === "overdue_daily") return "overdue_daily";
  if (slot === "12h") return "same_day";
  return "pre_due";
}

export function buildPaymentReminderText(p: LegacyParams): string {
  const kind = legacyKind(p.slot);
  const content = buildReminderContent({
    kind,
    daysBeforeDue: kind === "pre_due" ? legacyDaysUntilDue(p.slot) : undefined,
    params: {
      residentName: p.residentName,
      chargeTitle: p.chargeTitle,
      balanceDue: p.balanceDue,
      propertyLabel: p.propertyLabel,
      managerName: p.managerName,
      dueDateLabel: p.dueDateLabel,
      daysUntilDue: legacyDaysUntilDue(p.slot),
    },
  });
  return content.body;
}

export function buildPaymentReminderHtml(p: LegacyParams): string {
  const text = buildPaymentReminderText(p);
  const htmlBody = text
    .split("\n")
    .map((line) => (line.trim() ? `<p>${line.replace(/</g, "&lt;")}</p>` : ""))
    .join("\n");
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">\n${htmlBody}\n</body></html>`;
}

export function buildLateFeeNoticeText(input: {
  residentName: string;
  sourceTitle: string;
  lateFeeLabel: string;
  graceDays: number;
  propertyLabel: string;
  managerName: string;
}): string {
  const content = buildReminderContent({
    kind: "late_fee",
    params: {
      residentName: input.residentName,
      chargeTitle: input.sourceTitle,
      balanceDue: input.lateFeeLabel,
      propertyLabel: input.propertyLabel,
      managerName: input.managerName,
      dueDateLabel: "Due immediately",
      daysUntilDue: -input.graceDays,
      lateFeeAmount: input.lateFeeLabel,
      graceDays: input.graceDays,
    },
  });
  return content.body;
}

export function buildLateFeeNoticeSubject(sourceTitle: string, settings?: ManagerAutomationSettings): string {
  const content = buildReminderContent({
    kind: "late_fee",
    settings,
    params: {
      residentName: "Resident",
      chargeTitle: sourceTitle,
      balanceDue: "",
      propertyLabel: "",
      managerName: "",
      dueDateLabel: "",
      daysUntilDue: 0,
    },
  });
  return content.subject;
}
