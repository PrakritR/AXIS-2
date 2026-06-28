import type { SupabaseClient } from "@supabase/supabase-js";

export type PaymentReminderKind = "pre_due" | "same_day" | "overdue_daily" | "late_fee";

export type ScheduleVisibilityMode = "all" | "days_before_send";

export type ReminderTemplate = {
  subject: string;
  body: string;
};

export type ManagerAutomationSettings = {
  preDueReminderDays: number[];
  scheduleVisibilityMode: ScheduleVisibilityMode;
  scheduleVisibilityDays: number;
  overdueDailyEnabled: boolean;
  overdueDailyStartDays: number;
  lateFeeNoticeEnabled: boolean;
  lateFeeNoticeDaysAfterDue: number;
  sameDayReminderEnabled: boolean;
  templates: {
    preDue: ReminderTemplate;
    overdue: ReminderTemplate;
    lateFee: ReminderTemplate;
  };
};

export const DEFAULT_PRE_DUE_REMINDER_DAYS = [7, 3, 1] as const;

export const DEFAULT_MANAGER_AUTOMATION_SETTINGS: ManagerAutomationSettings = {
  preDueReminderDays: [...DEFAULT_PRE_DUE_REMINDER_DAYS],
  scheduleVisibilityMode: "days_before_send",
  scheduleVisibilityDays: 2,
  overdueDailyEnabled: true,
  overdueDailyStartDays: 1,
  lateFeeNoticeEnabled: true,
  lateFeeNoticeDaysAfterDue: 5,
  sameDayReminderEnabled: true,
  templates: {
    preDue: {
      subject: "Payment due in {daysUntilDue}: {chargeTitle}",
      body: [
        "Hi {residentName},",
        "",
        "This is an automated reminder that your {chargeTitle} payment is due in {daysUntilDue} ({dueDate}).",
        "",
        "Amount due: {balanceDue}",
        "{propertyLine}",
        "",
        "Please log in to your Axis resident portal to make your payment at your earliest convenience.",
        "",
        "If you have any questions, please don't hesitate to reach out.",
        "",
        "{managerName}",
        "Axis Portal",
      ].join("\n"),
    },
    overdue: {
      subject: "Overdue payment reminder: {chargeTitle}",
      body: [
        "Hi {residentName},",
        "",
        "This is an automated reminder that your {chargeTitle} payment is overdue ({dueDate}).",
        "",
        "Amount due: {balanceDue}",
        "{propertyLine}",
        "",
        "Please submit payment as soon as possible to avoid additional late fees.",
        "",
        "{managerName}",
        "Axis Portal",
      ].join("\n"),
    },
    lateFee: {
      subject: "Late fee added: {chargeTitle}",
      body: [
        "Hi {residentName},",
        "",
        "A late payment fee of {lateFeeAmount} has been added because {chargeTitle} is more than {graceDays} day(s) past due.",
        "{propertyLine}",
        "",
        "Please log in to your Axis resident portal to review and pay the updated balance.",
        "",
        "{managerName}",
        "Axis Portal",
      ].join("\n"),
    },
  },
};

export type ScheduledMessageOverride = {
  cancelled?: boolean;
  customSubject?: string;
  customBody?: string;
  customDaysBeforeDue?: number;
};

function normalizePreDueDays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [...DEFAULT_PRE_DUE_REMINDER_DAYS];
  const nums = raw
    .map((v) => Math.round(Number(v)))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 60);
  const unique = [...new Set(nums)].sort((a, b) => b - a);
  return unique.length ? unique : [...DEFAULT_PRE_DUE_REMINDER_DAYS];
}

function normalizeTemplate(raw: unknown, fallback: ReminderTemplate): ReminderTemplate {
  if (!raw || typeof raw !== "object") return fallback;
  const row = raw as Record<string, unknown>;
  const subject = typeof row.subject === "string" && row.subject.trim() ? row.subject.trim() : fallback.subject;
  const body = typeof row.body === "string" && row.body.trim() ? row.body.trim() : fallback.body;
  return { subject, body };
}

export function normalizeManagerAutomationSettings(raw: unknown): ManagerAutomationSettings {
  const base = DEFAULT_MANAGER_AUTOMATION_SETTINGS;
  if (!raw || typeof raw !== "object") return base;
  const row = raw as Record<string, unknown>;
  const templatesRaw = row.templates && typeof row.templates === "object" ? (row.templates as Record<string, unknown>) : {};

  const visibilityMode = row.scheduleVisibilityMode === "all" ? "all" : "days_before_send";
  const visibilityDays = Math.max(
    0,
    Math.min(30, Math.round(Number(row.scheduleVisibilityDays ?? base.scheduleVisibilityDays) || base.scheduleVisibilityDays)),
  );

  return {
    preDueReminderDays: normalizePreDueDays(row.preDueReminderDays),
    scheduleVisibilityMode: visibilityMode,
    scheduleVisibilityDays: visibilityDays,
    overdueDailyEnabled: row.overdueDailyEnabled !== false,
    overdueDailyStartDays: Math.max(
      0,
      Math.min(30, Math.round(Number(row.overdueDailyStartDays ?? base.overdueDailyStartDays) || base.overdueDailyStartDays)),
    ),
    lateFeeNoticeEnabled: row.lateFeeNoticeEnabled !== false,
    lateFeeNoticeDaysAfterDue: Math.max(
      0,
      Math.min(30, Math.round(Number(row.lateFeeNoticeDaysAfterDue ?? base.lateFeeNoticeDaysAfterDue) || base.lateFeeNoticeDaysAfterDue)),
    ),
    sameDayReminderEnabled: row.sameDayReminderEnabled !== false,
    templates: {
      preDue: normalizeTemplate(templatesRaw.preDue, base.templates.preDue),
      overdue: normalizeTemplate(templatesRaw.overdue, base.templates.overdue),
      lateFee: normalizeTemplate(templatesRaw.lateFee, base.templates.lateFee),
    },
  };
}

export async function loadManagerAutomationSettings(
  db: SupabaseClient,
  managerUserId: string,
): Promise<ManagerAutomationSettings> {
  const { data } = await db
    .from("manager_automation_settings")
    .select("row_data")
    .eq("manager_user_id", managerUserId)
    .maybeSingle();
  return normalizeManagerAutomationSettings(data?.row_data ?? null);
}

export async function saveManagerAutomationSettings(
  db: SupabaseClient,
  managerUserId: string,
  settings: ManagerAutomationSettings,
): Promise<ManagerAutomationSettings> {
  const normalized = normalizeManagerAutomationSettings(settings);
  const { error } = await db.from("manager_automation_settings").upsert(
    {
      manager_user_id: managerUserId,
      row_data: normalized,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "manager_user_id" },
  );
  if (error) throw error;
  return normalized;
}

export function scheduledOverrideId(input: {
  managerUserId: string;
  chargeId: string;
  kind: PaymentReminderKind;
  daysBeforeDue?: number | null;
}): string {
  const dayPart = input.daysBeforeDue == null ? "na" : String(input.daysBeforeDue);
  return `smo_${input.managerUserId.slice(0, 8)}_${input.chargeId}_${input.kind}_${dayPart}`;
}

export async function loadScheduledMessageOverrides(
  db: SupabaseClient,
  managerUserId: string,
): Promise<Map<string, ScheduledMessageOverride>> {
  const { data } = await db
    .from("scheduled_message_overrides")
    .select("id, charge_id, reminder_kind, days_before_due, row_data")
    .eq("manager_user_id", managerUserId);

  const map = new Map<string, ScheduledMessageOverride>();
  for (const row of data ?? []) {
    const key = scheduledOverrideId({
      managerUserId,
      chargeId: String(row.charge_id),
      kind: row.reminder_kind as PaymentReminderKind,
      daysBeforeDue: row.days_before_due as number | null,
    });
    map.set(key, (row.row_data ?? {}) as ScheduledMessageOverride);
  }
  return map;
}

export async function upsertScheduledMessageOverride(
  db: SupabaseClient,
  input: {
    managerUserId: string;
    chargeId: string;
    kind: PaymentReminderKind;
    daysBeforeDue?: number | null;
    patch: ScheduledMessageOverride;
  },
): Promise<void> {
  const id = scheduledOverrideId(input);
  const { data: existing } = await db.from("scheduled_message_overrides").select("row_data").eq("id", id).maybeSingle();
  const merged = { ...((existing?.row_data ?? {}) as ScheduledMessageOverride), ...input.patch };
  const { error } = await db.from("scheduled_message_overrides").upsert(
    {
      id,
      manager_user_id: input.managerUserId,
      charge_id: input.chargeId,
      reminder_kind: input.kind,
      days_before_due: input.daysBeforeDue ?? null,
      row_data: merged,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw error;
}

/** Legacy slot strings on household charges map to new reminder keys. */
export function legacySlotToKind(slot: string): { kind: PaymentReminderKind; daysBeforeDue?: number } | null {
  if (slot === "overdue_daily") return { kind: "overdue_daily" };
  if (slot === "12h") return { kind: "same_day" };
  const match = /^(\d+)d$/.exec(slot);
  if (match) return { kind: "pre_due", daysBeforeDue: Number(match[1]) };
  return null;
}

export function isLegacyReminderCancelled(
  cancelledReminders: string[] | undefined,
  kind: PaymentReminderKind,
  daysBeforeDue?: number,
): boolean {
  if (!cancelledReminders?.length) return false;
  if (kind === "overdue_daily") return cancelledReminders.includes("overdue_daily");
  if (kind === "same_day") return cancelledReminders.includes("12h");
  if (kind === "pre_due" && daysBeforeDue != null) {
    return cancelledReminders.includes(`${daysBeforeDue}d`);
  }
  return false;
}

export function paymentReminderDedupId(input: {
  kind: PaymentReminderKind;
  chargeId: string;
  daysBeforeDue?: number;
  todayKey?: string;
}): string {
  if (input.kind === "overdue_daily") {
    return `payment_reminder_overdue_${input.todayKey ?? "day"}_${input.chargeId}`;
  }
  if (input.kind === "same_day") {
    return `payment_reminder_same_day_${input.chargeId}`;
  }
  if (input.kind === "late_fee") {
    return `late_fee_notice_${input.chargeId}`;
  }
  const days = input.daysBeforeDue ?? 0;
  const modern = `payment_reminder_pre_${days}d_${input.chargeId}`;
  return modern;
}

export function legacyPaymentReminderDedupIds(input: {
  kind: PaymentReminderKind;
  chargeId: string;
  daysBeforeDue?: number;
}): string[] {
  const ids = [paymentReminderDedupId(input)];
  if (input.kind === "pre_due" && input.daysBeforeDue === 7) ids.push(`payment_reminder_7d_${input.chargeId}`);
  if (input.kind === "pre_due" && input.daysBeforeDue === 5) ids.push(`payment_reminder_5d_${input.chargeId}`);
  if (input.kind === "pre_due" && input.daysBeforeDue === 3) ids.push(`payment_reminder_3d_${input.chargeId}`);
  if (input.kind === "same_day") ids.push(`payment_reminder_12h_${input.chargeId}`);
  return ids;
}
