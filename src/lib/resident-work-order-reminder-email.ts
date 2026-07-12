/**
 * Resident → manager pending work order reminder copy. Shared by the API route and unit tests.
 */

export const RESIDENT_WORK_ORDER_REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export type ResidentWorkOrderReminderEmailInput = {
  residentName: string;
  workOrderTitle: string;
  propertyLabel: string;
  unit?: string;
  priority: string;
  preferredArrival?: string;
  description: string;
  workOrderId: string;
};

function propertyWhere(input: Pick<ResidentWorkOrderReminderEmailInput, "propertyLabel" | "unit">): string {
  const unit = input.unit?.trim();
  return unit && unit !== "—" ? `${input.propertyLabel} · ${unit}` : input.propertyLabel;
}

export function buildResidentWorkOrderReminderEmail(
  input: ResidentWorkOrderReminderEmailInput,
): { subject: string; text: string } {
  const where = propertyWhere(input);
  const title = input.workOrderTitle.trim() || "Maintenance request";
  const resident = input.residentName.trim() || "A resident";
  const priority = input.priority.trim() || "Medium";
  const arrival = input.preferredArrival?.trim() || "Anytime";
  const details = input.description.trim() || "—";

  const subject = `Reminder: pending maintenance — ${title}`;
  const text = [
    "Hi,",
    "",
    `${resident} is following up on a pending maintenance request.`,
    "",
    `Request: ${title}`,
    `Property: ${where}`,
    `Priority: ${priority}`,
    `Preferred arrival: ${arrival}`,
    "",
    "Details:",
    details,
    "",
    `Request ID: ${input.workOrderId.trim()}`,
    "",
    "Please review and schedule this work order in PropLane when ready.",
    "",
    "PropLane Portal",
  ].join("\n");

  return { subject, text };
}
