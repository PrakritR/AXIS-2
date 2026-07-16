import { z } from "zod";
import { defineTool, defineWriteTool } from "../registry";
import type { AgentContext } from "../context";
import {
  formatStandardReminderSchedule,
  loadManagerAutomationSettings,
  normalizeManagerAutomationSettings,
  saveManagerAutomationSettings,
  upsertScheduledMessageOverride,
  type ManagerAutomationSettings,
  type PaymentReminderKind,
} from "@/lib/payment-automation-settings";
import { loadManagerScheduledMessages } from "@/lib/payment-automation-server";
import type { ScheduledPaymentMessage } from "@/lib/scheduled-payment-messages";
import { writeAuditLog, updateAuditResult } from "../audit";
import { stableInputHash } from "./charges";

/**
 * The togglable automation fields the agent may change. Free-text reminder
 * TEMPLATES are deliberately excluded everywhere in this file (read and write):
 * they are an injection surface into every outbound reminder email.
 */
function settingsProjection(s: ManagerAutomationSettings) {
  return {
    preDueReminderDays: s.preDueReminderDays,
    sameDayReminderEnabled: s.sameDayReminderEnabled,
    overdueDailyEnabled: s.overdueDailyEnabled,
    overdueDailyStartDays: s.overdueDailyStartDays,
    lateFeeNoticeEnabled: s.lateFeeNoticeEnabled,
    lateFeeNoticeDaysAfterDue: s.lateFeeNoticeDaysAfterDue,
    scheduleVisibilityMode: s.scheduleVisibilityMode,
    scheduleVisibilityDays: s.scheduleVisibilityDays,
    postDueReminderDays: s.postDueReminderDays,
    setDateReminders: s.setDateReminders,
  };
}

export const getAutomationSettingsTool = defineTool({
  name: "get_automation_settings",
  description:
    "Read the landlord's payment-reminder automation settings: pre-due reminder days, same-day and overdue-daily reminders, late-fee notice timing, and schedule visibility, plus a human-readable cadence summary. Use before update_automation_settings to see current values.",
  kind: "read",
  inputSchema: z.object({}).strict(),
  handler: async (ctx) => {
    const settings = await loadManagerAutomationSettings(ctx.db, ctx.landlordId);
    return {
      scheduleSummary: formatStandardReminderSchedule(settings),
      settings: settingsProjection(settings),
    };
  },
});

type SettingsPatch = {
  preDueReminderDays?: number[];
  sameDayReminderEnabled?: boolean;
  overdueDailyEnabled?: boolean;
  overdueDailyStartDays?: number;
  lateFeeNoticeEnabled?: boolean;
  lateFeeNoticeDaysAfterDue?: number;
  scheduleVisibilityMode?: "all" | "days_before_send";
  scheduleVisibilityDays?: number;
};

const PATCH_LABELS: Record<keyof SettingsPatch, string> = {
  preDueReminderDays: "Pre-due reminder days",
  sameDayReminderEnabled: "Same-day reminder",
  overdueDailyEnabled: "Daily overdue reminders",
  overdueDailyStartDays: "Overdue reminders start (days late)",
  lateFeeNoticeEnabled: "Late-fee notice",
  lateFeeNoticeDaysAfterDue: "Late-fee notice after (days)",
  scheduleVisibilityMode: "Schedule visibility",
  scheduleVisibilityDays: "Schedule visible (days before send)",
};

function formatSettingValue(value: unknown): string {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "none";
  if (typeof value === "boolean") return value ? "on" : "off";
  return String(value);
}

/** Only the keys the model actually supplied (undefined never overwrites). */
function definedPatch(input: SettingsPatch): SettingsPatch {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = value;
  }
  return out as SettingsPatch;
}

export const updateAutomationSettingsTool = defineWriteTool({
  name: "update_automation_settings",
  description:
    "Change the landlord's payment-reminder automation settings: pre-due reminder days, same-day reminder, daily overdue reminders and their start day, late-fee notice and its grace days, and schedule visibility. Reminder message templates cannot be edited with this tool.",
  kind: "write",
  inputSchema: z
    .object({
      preDueReminderDays: z
        .array(z.number().int().min(0).max(60))
        .max(10)
        .optional()
        .describe("Days before the due date to send reminders, e.g. [3, 2, 1]."),
      sameDayReminderEnabled: z.boolean().optional().describe("Send a reminder on the due date itself."),
      overdueDailyEnabled: z.boolean().optional().describe("Send a reminder every day a charge is overdue."),
      overdueDailyStartDays: z
        .number()
        .int()
        .min(0)
        .max(30)
        .optional()
        .describe("How many days late the daily overdue reminders start."),
      lateFeeNoticeEnabled: z.boolean().optional().describe("Send a late-fee notice for overdue charges."),
      lateFeeNoticeDaysAfterDue: z
        .number()
        .int()
        .min(0)
        .max(30)
        .optional()
        .describe("Days past due before the late-fee notice sends."),
      scheduleVisibilityMode: z
        .enum(["all", "days_before_send"])
        .optional()
        .describe("Show all upcoming reminders, or only those within a window before sending."),
      scheduleVisibilityDays: z
        .number()
        .int()
        .min(0)
        .max(30)
        .optional()
        .describe("Window size (days before send) when scheduleVisibilityMode is days_before_send."),
    })
    .strict(),
  preview: async (ctx, input) => {
    const patch = definedPatch(input);
    const keys = Object.keys(patch) as (keyof SettingsPatch)[];
    if (keys.length === 0) {
      return { ok: false, error: "Nothing to update — pass at least one automation setting field." };
    }
    const current = await loadManagerAutomationSettings(ctx.db, ctx.landlordId);
    const next = normalizeManagerAutomationSettings({ ...current, ...patch });

    // Before → after diff, both sides normalized server-side.
    const lines = keys.map((key) => ({
      label: PATCH_LABELS[key],
      value: `${formatSettingValue(current[key])} → ${formatSettingValue(next[key])}`,
    }));
    lines.push({ label: "New cadence", value: formatStandardReminderSchedule(next) });
    return {
      ok: true,
      input,
      preview: {
        title: "Update automation settings",
        summary: `Update ${keys.length} payment-automation setting${keys.length === 1 ? "" : "s"}.`,
        lines,
        confirmLabel: "Update settings",
      },
    };
  },
  execute: async (ctx, input) => {
    const patch = definedPatch(input);
    if (Object.keys(patch).length === 0) return { ok: false, error: "Nothing to update." };

    const dedupeKey = `update_automation_settings:${ctx.landlordId}:${stableInputHash(patch)}`;
    const audit = await writeAuditLog(ctx, {
      action: "update_automation_settings",
      toolName: "update_automation_settings",
      inputSummary: { fields: Object.keys(patch) },
      dedupeKey,
    });
    if (!audit.recorded) {
      if (audit.duplicate) return { ok: true, reply: "Those automation settings were already applied by this action." };
      return { ok: false, error: "Could not record the action; settings were not changed." };
    }

    // Merge onto the CURRENT stored settings, then normalize + save (save
    // normalizes again — defense in depth against out-of-range values).
    let saved: ManagerAutomationSettings;
    try {
      const current = await loadManagerAutomationSettings(ctx.db, ctx.landlordId);
      saved = await saveManagerAutomationSettings(
        ctx.db,
        ctx.landlordId,
        normalizeManagerAutomationSettings({ ...current, ...patch }),
      );
    } catch (e) {
      await updateAuditResult(ctx, dedupeKey, { error: "settings_save_failed" }, { clearDedupeKey: true });
      return { ok: false, error: e instanceof Error ? e.message : "The settings could not be saved." };
    }

    await updateAuditResult(ctx, dedupeKey, { fields: Object.keys(patch), saved: true });
    return {
      ok: true,
      reply: `Updated payment automation settings. Reminder cadence is now: ${formatStandardReminderSchedule(saved)}.`,
      resultSummary: { fields: Object.keys(patch) },
    };
  },
});

const REMINDER_KINDS = ["pre_due", "same_day", "post_due", "overdue_daily", "late_fee", "set_date"] as const;

/** Short human description of a slot for corrective error messages. */
function describeSlot(m: ScheduledPaymentMessage): string {
  const day = m.daysBeforeDue != null ? ` (daysBeforeDue ${m.daysBeforeDue})` : "";
  return `${m.kind}${day} — ${m.status}`;
}

/**
 * Resolve one scheduled reminder slot from the landlord's own projected
 * schedule (loadManagerScheduledMessages is scoped by manager id, so a foreign
 * chargeId never matches). Errors are corrective: they list the charge's real
 * slots so the model can retry with valid arguments.
 */
async function resolveScheduledSlot(
  ctx: AgentContext,
  input: { chargeId: string; kind: PaymentReminderKind; daysBeforeDue?: number },
): Promise<{ ok: true; slot: ScheduledPaymentMessage } | { ok: false; error: string }> {
  const { messages } = await loadManagerScheduledMessages(ctx.db, ctx.landlordId, { includeHidden: true });
  const forCharge = messages.filter((m) => m.chargeId === input.chargeId);
  if (forCharge.length === 0) {
    return {
      ok: false,
      error: `No scheduled reminders exist for charge ${input.chargeId} on this landlord's account. Use list_charges to find valid charge ids.`,
    };
  }
  const matches = forCharge.filter(
    (m) => m.kind === input.kind && (input.daysBeforeDue == null || m.daysBeforeDue === input.daysBeforeDue),
  );
  if (matches.length === 0) {
    return {
      ok: false,
      error: `No ${input.kind} reminder${input.daysBeforeDue != null ? ` at ${input.daysBeforeDue} days before due` : ""} exists for this charge. Its reminders: ${forCharge.map(describeSlot).join("; ")}.`,
    };
  }
  const scheduled = matches.filter((m) => m.status === "scheduled");
  if (scheduled.length === 0) {
    return {
      ok: false,
      error: `That reminder is already ${matches[0]!.status} and cannot be changed. Reminders for this charge: ${forCharge.map(describeSlot).join("; ")}.`,
    };
  }
  if (scheduled.length > 1 && input.daysBeforeDue == null) {
    return {
      ok: false,
      error: `Multiple ${input.kind} reminders exist for this charge — pass daysBeforeDue to pick one: ${scheduled.map(describeSlot).join("; ")}.`,
    };
  }
  return { ok: true, slot: scheduled[0]! };
}

function slotDayPart(slot: ScheduledPaymentMessage): string {
  return slot.daysBeforeDue == null ? "na" : String(slot.daysBeforeDue);
}

function slotSendLabel(slot: ScheduledPaymentMessage): string {
  const d = new Date(slot.sendAt);
  return Number.isNaN(d.getTime())
    ? slot.sendAt
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const scheduledSlotInput = {
  chargeId: z.string().min(1).describe("Id of the charge the reminder belongs to (from list_charges)."),
  kind: z
    .enum(REMINDER_KINDS)
    .describe("Reminder slot kind: pre_due, same_day, post_due, overdue_daily, late_fee, or set_date."),
  daysBeforeDue: z
    .number()
    .int()
    .optional()
    .describe("Which pre_due slot (days before due), when several are configured."),
};

export const cancelScheduledReminderTool = defineWriteTool({
  name: "cancel_scheduled_reminder",
  description:
    "Cancel one upcoming automatic payment reminder for a specific charge (e.g. skip the 3-days-before reminder for one resident). Pass the charge id from list_charges or get_overdue_charges plus the reminder kind; other reminders for the charge are unaffected.",
  kind: "write",
  inputSchema: z.object(scheduledSlotInput).strict(),
  preview: async (ctx, input) => {
    const resolved = await resolveScheduledSlot(ctx, input);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const { slot } = resolved;
    return {
      ok: true,
      input,
      preview: {
        title: "Cancel scheduled reminder",
        summary: `Cancel the ${slot.typeLabel} for ${slot.residentName}'s "${slot.chargeTitle}".`,
        lines: [
          { label: "Resident", value: slot.residentName },
          { label: "Charge", value: slot.chargeTitle },
          { label: "Reminder", value: slot.typeLabel },
          { label: "Was scheduled for", value: slotSendLabel(slot) },
        ],
        confirmLabel: "Cancel reminder",
      },
    };
  },
  execute: async (ctx, input) => {
    // Re-resolve against the live projected schedule at execute time.
    const resolved = await resolveScheduledSlot(ctx, input);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const { slot } = resolved;

    const dedupeKey = `cancel_scheduled_reminder:${ctx.landlordId}:${slot.chargeId}:${slot.kind}:${slotDayPart(slot)}`;
    const audit = await writeAuditLog(ctx, {
      action: "cancel_scheduled_reminder",
      toolName: "cancel_scheduled_reminder",
      inputSummary: { chargeId: slot.chargeId, kind: slot.kind, daysBeforeDue: slot.daysBeforeDue },
      dedupeKey,
    });
    if (!audit.recorded) {
      if (audit.duplicate) return { ok: true, reply: "That reminder was already cancelled by this action." };
      return { ok: false, error: "Could not record the action; the reminder was not cancelled." };
    }

    try {
      await upsertScheduledMessageOverride(ctx.db, {
        managerUserId: ctx.landlordId,
        chargeId: slot.chargeId,
        kind: slot.kind,
        daysBeforeDue: slot.daysBeforeDue,
        patch: { cancelled: true },
      });
    } catch (e) {
      await updateAuditResult(ctx, dedupeKey, { error: "override_write_failed" }, { clearDedupeKey: true });
      return { ok: false, error: e instanceof Error ? e.message : "The reminder could not be cancelled." };
    }

    await updateAuditResult(ctx, dedupeKey, { cancelled: true });
    return {
      ok: true,
      reply: `Cancelled the ${slot.typeLabel} for ${slot.residentName}'s "${slot.chargeTitle}" (was scheduled for ${slotSendLabel(slot)}).`,
      resultSummary: { chargeId: slot.chargeId, kind: slot.kind, daysBeforeDue: slot.daysBeforeDue },
    };
  },
});

export const rescheduleReminderTool = defineWriteTool({
  name: "reschedule_reminder",
  description:
    "Move one upcoming automatic payment reminder for a specific charge to a new send time. Pass the charge id from list_charges plus the reminder kind, and the new time as an ISO datetime in the future.",
  kind: "write",
  inputSchema: z
    .object({
      ...scheduledSlotInput,
      newSendAtIso: z
        .string()
        .min(1)
        .describe("New send time as an ISO 8601 datetime, e.g. 2026-07-20T09:00:00Z. Must be in the future."),
    })
    .strict(),
  preview: async (ctx, input) => {
    const newSendAt = new Date(input.newSendAtIso);
    if (Number.isNaN(newSendAt.getTime())) {
      return { ok: false, error: `Invalid newSendAtIso "${input.newSendAtIso}" — pass an ISO 8601 datetime.` };
    }
    if (newSendAt.getTime() <= Date.now()) {
      return { ok: false, error: "newSendAtIso is in the past — pass a future send time." };
    }
    const resolved = await resolveScheduledSlot(ctx, input);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const { slot } = resolved;
    return {
      ok: true,
      input,
      preview: {
        title: "Reschedule reminder",
        summary: `Move the ${slot.typeLabel} for ${slot.residentName}'s "${slot.chargeTitle}" to ${newSendAt.toLocaleString()}.`,
        lines: [
          { label: "Resident", value: slot.residentName },
          { label: "Charge", value: slot.chargeTitle },
          { label: "Reminder", value: slot.typeLabel },
          { label: "Send time", value: `${slotSendLabel(slot)} → ${newSendAt.toLocaleString()}` },
        ],
        confirmLabel: "Reschedule reminder",
      },
    };
  },
  execute: async (ctx, input) => {
    const newSendAt = new Date(input.newSendAtIso);
    if (Number.isNaN(newSendAt.getTime()) || newSendAt.getTime() <= Date.now()) {
      return { ok: false, error: "newSendAtIso must be a valid ISO datetime in the future." };
    }
    const resolved = await resolveScheduledSlot(ctx, input);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const { slot } = resolved;

    const dedupeKey = `reschedule_reminder:${ctx.landlordId}:${slot.chargeId}:${slot.kind}:${slotDayPart(slot)}:${stableInputHash(newSendAt.toISOString())}`;
    const audit = await writeAuditLog(ctx, {
      action: "reschedule_reminder",
      toolName: "reschedule_reminder",
      inputSummary: {
        chargeId: slot.chargeId,
        kind: slot.kind,
        daysBeforeDue: slot.daysBeforeDue,
        newSendAt: newSendAt.toISOString(),
      },
      dedupeKey,
    });
    if (!audit.recorded) {
      if (audit.duplicate) return { ok: true, reply: "That reminder was already rescheduled to that time by this action." };
      return { ok: false, error: "Could not record the action; the reminder was not rescheduled." };
    }

    try {
      await upsertScheduledMessageOverride(ctx.db, {
        managerUserId: ctx.landlordId,
        chargeId: slot.chargeId,
        kind: slot.kind,
        daysBeforeDue: slot.daysBeforeDue,
        patch: { customSendAt: newSendAt.toISOString() },
      });
    } catch (e) {
      await updateAuditResult(ctx, dedupeKey, { error: "override_write_failed" }, { clearDedupeKey: true });
      return { ok: false, error: e instanceof Error ? e.message : "The reminder could not be rescheduled." };
    }

    await updateAuditResult(ctx, dedupeKey, { rescheduled: true });
    return {
      ok: true,
      reply: `Rescheduled the ${slot.typeLabel} for ${slot.residentName}'s "${slot.chargeTitle}" from ${slotSendLabel(slot)} to ${newSendAt.toLocaleString()}.`,
      resultSummary: { chargeId: slot.chargeId, kind: slot.kind, daysBeforeDue: slot.daysBeforeDue },
    };
  },
});
