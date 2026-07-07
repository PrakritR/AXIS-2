import {
  DEFAULT_MANAGER_AUTOMATION_SETTINGS,
  type ManagerAutomationSettings,
} from "@/lib/payment-automation-settings";
import { householdChargeDueDate, type HouseholdCharge } from "@/lib/household-charges";

/** Display label for a calendar due date (matches add-payment modal formatting). */
export function formatChargeDueDateLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Default due date far enough out that the manager's pre-due reminder cadence can fully apply.
 * Uses max(preDueDays) + 1 so every configured pre-due slot lands in the future at creation time.
 */
export function defaultDueDateLabelForReminderSettings(
  settings: ManagerAutomationSettings = DEFAULT_MANAGER_AUTOMATION_SETTINGS,
  from = new Date(),
): string {
  const maxPreDue = settings.preDueReminderDays.length ? Math.max(...settings.preDueReminderDays) : 0;
  const daysOut = Math.max(maxPreDue + 1, 1);
  const due = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12, 0, 0, 0);
  due.setDate(due.getDate() + daysOut);
  return formatChargeDueDateLabel(due);
}

/** ISO date (YYYY-MM-DD) for date inputs — default due far enough out for the reminder cadence. */
export function defaultDueIsoForReminderSettings(
  settings: ManagerAutomationSettings = DEFAULT_MANAGER_AUTOMATION_SETTINGS,
  from = new Date(),
): string {
  const maxPreDue = settings.preDueReminderDays.length ? Math.max(...settings.preDueReminderDays) : 0;
  const daysOut = Math.max(maxPreDue + 1, 1);
  const due = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12, 0, 0, 0);
  due.setDate(due.getDate() + daysOut);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`;
}

/** Ensure a new pending charge has a parseable due date so auto reminders can be projected. */
export function ensureChargeDueDateForReminders(
  charge: HouseholdCharge,
  settings: ManagerAutomationSettings = DEFAULT_MANAGER_AUTOMATION_SETTINGS,
): HouseholdCharge {
  if (charge.status === "paid") return charge;
  if (charge.dueDateLabel?.trim() && householdChargeDueDate(charge)) return charge;
  return {
    ...charge,
    dueDateLabel: defaultDueDateLabelForReminderSettings(settings),
  };
}
