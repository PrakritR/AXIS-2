import { describe, expect, it } from "vitest";
import { DEFAULT_MANAGER_AUTOMATION_SETTINGS } from "@/lib/payment-automation-settings";
import {
  applyReminderTemplate,
  buildReminderContent,
  formatDaysUntilDuePhrase,
} from "@/lib/payment-reminder-email";

const baseParams = {
  residentName: "Alex",
  chargeTitle: "Move-in cost",
  balanceDue: "$500.00",
  propertyLabel: "QA Madison Studio",
  managerName: "Jamie",
  dueDateLabel: "Aug 6, 2026",
};

describe("payment reminder templates", () => {
  it("formats same-day reminders without 'in today'", () => {
    expect(formatDaysUntilDuePhrase(0)).toBe("today");
    const subject = applyReminderTemplate(
      DEFAULT_MANAGER_AUTOMATION_SETTINGS.templates.preDue.subject,
      { ...baseParams, daysUntilDue: 0 },
    );
    expect(subject).toBe("Payment due today: Move-in cost");
    expect(subject).not.toContain("in today");
  });

  it("formats pre-due reminders with correct grammar", () => {
    const subject = applyReminderTemplate(
      DEFAULT_MANAGER_AUTOMATION_SETTINGS.templates.preDue.subject,
      { ...baseParams, daysUntilDue: 1 },
    );
    expect(subject).toBe("Payment due in 1 day: Move-in cost");

    const body = buildReminderContent({
      kind: "pre_due",
      daysBeforeDue: 3,
      params: { ...baseParams, daysUntilDue: 3 },
    }).body;
    expect(body).toContain("due in 3 days (Aug 6, 2026)");
  });

  it("rewrites legacy templates that still use 'in {daysUntilDue}'", () => {
    const subject = applyReminderTemplate("Payment due in {daysUntilDue}: {chargeTitle}", {
      ...baseParams,
      daysUntilDue: 0,
    });
    expect(subject).toBe("Payment due today: Move-in cost");
  });
});
