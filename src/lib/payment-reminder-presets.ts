import type { ManagerAutomationSettings } from "./payment-automation-settings";
import { formatStandardReminderSchedule } from "./payment-automation-settings";

export type ReminderPresetId = "standard" | "gentle" | "minimal" | "custom";

export type ReminderPreset = {
  id: Exclude<ReminderPresetId, "custom">;
  label: string;
  description: string;
  recommended?: boolean;
  settings: Pick<
    ManagerAutomationSettings,
    "preDueReminderDays" | "sameDayReminderEnabled" | "overdueDailyEnabled" | "overdueDailyStartDays" | "postDueReminderDays"
  >;
};

export const PAYMENT_REMINDER_PRESETS: ReminderPreset[] = [
  {
    id: "standard",
    label: "Standard",
    description: "3, 2, and 1 days before, on the due date, then daily until paid.",
    recommended: true,
    settings: {
      preDueReminderDays: [3, 2, 1],
      sameDayReminderEnabled: true,
      overdueDailyEnabled: true,
      overdueDailyStartDays: 1,
      postDueReminderDays: [],
    },
  },
  {
    id: "gentle",
    label: "Gentle",
    description: "One reminder 3 days before and on the due date.",
    settings: {
      preDueReminderDays: [3],
      sameDayReminderEnabled: true,
      overdueDailyEnabled: false,
      overdueDailyStartDays: 1,
      postDueReminderDays: [],
    },
  },
  {
    id: "minimal",
    label: "Due date only",
    description: "A single reminder on the day payment is due.",
    settings: {
      preDueReminderDays: [],
      sameDayReminderEnabled: true,
      overdueDailyEnabled: false,
      overdueDailyStartDays: 1,
      postDueReminderDays: [],
    },
  },
];

function sortedDays(days: number[]): number[] {
  return [...days].sort((a, b) => b - a);
}

function reminderCadenceMatches(
  settings: ManagerAutomationSettings,
  preset: ReminderPreset,
): boolean {
  return (
    JSON.stringify(sortedDays(settings.preDueReminderDays)) ===
      JSON.stringify(sortedDays(preset.settings.preDueReminderDays)) &&
    settings.sameDayReminderEnabled === preset.settings.sameDayReminderEnabled &&
    settings.overdueDailyEnabled === preset.settings.overdueDailyEnabled &&
    (settings.postDueReminderDays?.length ?? 0) === 0
  );
}

export function detectReminderPreset(settings: ManagerAutomationSettings): ReminderPresetId {
  for (const preset of PAYMENT_REMINDER_PRESETS) {
    if (reminderCadenceMatches(settings, preset)) return preset.id;
  }
  return "custom";
}

export function applyReminderPreset(
  current: ManagerAutomationSettings,
  presetId: ReminderPresetId,
): ManagerAutomationSettings {
  if (presetId === "custom") return current;
  const preset = PAYMENT_REMINDER_PRESETS.find((row) => row.id === presetId);
  if (!preset) return current;
  return {
    ...current,
    ...preset.settings,
  };
}

export function buildReminderPreviewLines(
  settings: Pick<
    ManagerAutomationSettings,
    "preDueReminderDays" | "sameDayReminderEnabled" | "overdueDailyEnabled"
  >,
): string[] {
  const lines: string[] = [];
  const pre = [...settings.preDueReminderDays].sort((a, b) => b - a);
  for (const days of pre) {
    lines.push(`${days} day${days === 1 ? "" : "s"} before due`);
  }
  if (settings.sameDayReminderEnabled) lines.push("On the due date");
  if (settings.overdueDailyEnabled) lines.push("Every day after the due date until paid");
  if (!lines.length) lines.push("No automatic reminders");
  return lines;
}

export function formatFriendlyReminderSchedule(settings: ManagerAutomationSettings): string {
  const preset = detectReminderPreset(settings);
  if (preset !== "custom") {
    const match = PAYMENT_REMINDER_PRESETS.find((row) => row.id === preset);
    if (match) return match.label;
  }
  return formatStandardReminderSchedule(settings);
}
