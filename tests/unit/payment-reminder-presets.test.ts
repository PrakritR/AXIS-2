import { describe, expect, it } from "vitest";
import {
  applyReminderPreset,
  detectReminderPreset,
  formatPreDueReminderDaysInput,
  parsePreDueReminderDaysInput,
} from "@/lib/payment-reminder-presets";
import { DEFAULT_MANAGER_AUTOMATION_SETTINGS } from "@/lib/payment-automation-settings";

describe("payment-reminder-presets", () => {
  it("detects the Basics preset", () => {
    const settings = applyReminderPreset(DEFAULT_MANAGER_AUTOMATION_SETTINGS, "basics");
    expect(detectReminderPreset(settings)).toBe("basics");
    expect(settings.preDueReminderDays).toEqual([7, 2, 1]);
    expect(settings.sameDayReminderEnabled).toBe(false);
    expect(settings.overdueDailyEnabled).toBe(true);
  });

  it("parses and formats custom day input", () => {
    expect(parsePreDueReminderDaysInput("30, 21, 6, 3")).toEqual([30, 21, 6, 3]);
    expect(formatPreDueReminderDaysInput([3, 30, 6])).toBe("30, 6, 3");
  });
});
