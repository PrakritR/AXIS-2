import { describe, expect, it } from "vitest";
import {
  DEFAULT_MANAGER_AUTOMATION_SETTINGS,
  normalizeManagerAutomationSettings,
  scheduledOverrideId,
  isLegacyReminderCancelled,
  paymentReminderDedupId,
} from "@/lib/payment-automation-settings";

describe("payment-automation-settings", () => {
  it("normalizes pre-due days uniquely and sorted descending", () => {
    const settings = normalizeManagerAutomationSettings({
      preDueReminderDays: [1, 3, 3, 30, -1, 1.6],
    });
    expect(settings.preDueReminderDays).toEqual([30, 3, 2, 1]);
  });

  it("builds stable override ids", () => {
    expect(
      scheduledOverrideId({
        managerUserId: "mgr-uuid-1234",
        chargeId: "hc_rent_1",
        kind: "pre_due",
        daysBeforeDue: 3,
      }),
    ).toContain("hc_rent_1");
  });

  it("maps legacy cancelled reminder slots", () => {
    expect(isLegacyReminderCancelled(["3d", "12h"], "pre_due", 3)).toBe(true);
    expect(isLegacyReminderCancelled(["3d"], "same_day")).toBe(false);
    expect(isLegacyReminderCancelled(["12h"], "same_day")).toBe(true);
  });

  it("uses modern dedup ids for pre-due reminders", () => {
    expect(paymentReminderDedupId({ kind: "pre_due", chargeId: "hc_1", daysBeforeDue: 3 })).toBe(
      "payment_reminder_pre_3d_hc_1",
    );
  });

  it("defaults visibility mode to days_before_send", () => {
    expect(DEFAULT_MANAGER_AUTOMATION_SETTINGS.scheduleVisibilityMode).toBe("days_before_send");
    expect(DEFAULT_MANAGER_AUTOMATION_SETTINGS.scheduleVisibilityDays).toBe(2);
  });
});
