import { describe, expect, it } from "vitest";
import {
  applyReminderPreset,
  detectReminderPreset,
  formatPreDueReminderDaysInput,
  parsePreDueReminderDaysInput,
  reminderScheduleTokensFromSettings,
  settingsPatchFromReminderScheduleTokens,
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

  it("maps unified reminder tokens to settings", () => {
    const patch = settingsPatchFromReminderScheduleTokens([
      "before:7",
      "before:2",
      "before:1",
      "every_day_late",
    ]);
    expect(patch.preDueReminderDays).toEqual([7, 2, 1]);
    expect(patch.sameDayReminderEnabled).toBe(false);
    expect(patch.overdueDailyEnabled).toBe(true);
    expect(reminderScheduleTokensFromSettings({
      preDueReminderDays: patch.preDueReminderDays,
      sameDayReminderEnabled: patch.sameDayReminderEnabled,
      overdueDailyEnabled: patch.overdueDailyEnabled,
    })).toEqual(["before:7", "before:2", "before:1", "every_day_late"]);
  });
});
