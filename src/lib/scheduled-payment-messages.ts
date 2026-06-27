import {
  chargeDueLabel,
  householdChargeDueDate,
  type HouseholdCharge,
} from "@/lib/household-charges";
import { lateFeePolicyFromSubmission } from "@/lib/payment-policy";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import {
  type ManagerAutomationSettings,
  type PaymentReminderKind,
  type ScheduledMessageOverride,
  DEFAULT_MANAGER_AUTOMATION_SETTINGS,
  isLegacyReminderCancelled,
  legacyPaymentReminderDedupIds,
  paymentReminderDedupId,
  scheduledOverrideId,
} from "@/lib/payment-automation-settings";
import { buildReminderContent } from "@/lib/payment-reminder-email";

export type ScheduledPaymentMessageStatus = "scheduled" | "cancelled" | "sent";

export type ScheduledPaymentMessage = {
  id: string;
  chargeId: string;
  kind: PaymentReminderKind;
  daysBeforeDue: number | null;
  sendAt: string;
  visibleFrom: string;
  dueDate: string | null;
  dueDateLabel: string;
  residentName: string;
  residentEmail: string;
  chargeTitle: string;
  propertyLabel: string;
  balanceDue: string;
  subject: string;
  body: string;
  status: ScheduledPaymentMessageStatus;
  managerUserId: string;
  typeLabel: string;
};

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return startOfLocalDay(next);
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((startOfLocalDay(b).getTime() - startOfLocalDay(a).getTime()) / (1000 * 60 * 60 * 24));
}

export function scheduledMessageListId(input: {
  chargeId: string;
  kind: PaymentReminderKind;
  daysBeforeDue: number | null;
  sendAt: Date;
}): string {
  const dayPart = input.daysBeforeDue == null ? "na" : String(input.daysBeforeDue);
  return ["sched", input.chargeId, input.kind, dayPart, dateKey(input.sendAt)].join("|");
}

export function computePreDueSendAt(dueDate: Date, daysBeforeDue: number): Date {
  return addDays(dueDate, -daysBeforeDue);
}

function typeLabel(kind: PaymentReminderKind, daysBeforeDue: number | null): string {
  if (kind === "pre_due") return `${daysBeforeDue ?? 0} day(s) before due`;
  if (kind === "same_day") return "Due day";
  if (kind === "overdue_daily") return "Overdue daily";
  return "Late fee notice";
}

function isVisible(
  settings: ManagerAutomationSettings,
  sendAt: Date,
  visibleFrom: Date,
  now: Date,
): boolean {
  if (settings.scheduleVisibilityMode === "all") return true;
  return startOfLocalDay(now).getTime() >= startOfLocalDay(visibleFrom).getTime();
}

function resolveOverride(
  overrides: Map<string, ScheduledMessageOverride>,
  managerUserId: string,
  chargeId: string,
  kind: PaymentReminderKind,
  daysBeforeDue: number | null,
): ScheduledMessageOverride | undefined {
  return overrides.get(
    scheduledOverrideId({ managerUserId, chargeId, kind, daysBeforeDue }),
  );
}

function isSent(sentIds: Set<string>, kind: PaymentReminderKind, chargeId: string, daysBeforeDue: number | null, todayKey: string): boolean {
  const candidates =
    kind === "overdue_daily"
      ? [paymentReminderDedupId({ kind, chargeId, todayKey })]
      : legacyPaymentReminderDedupIds({ kind, chargeId, daysBeforeDue: daysBeforeDue ?? undefined });
  return candidates.some((id) => sentIds.has(id));
}

export function projectScheduledPaymentMessages(input: {
  managerUserId: string;
  charges: HouseholdCharge[];
  settings?: ManagerAutomationSettings;
  overrides?: Map<string, ScheduledMessageOverride>;
  sentDedupIds?: Set<string>;
  listingByPropertyId?: Map<string, ManagerListingSubmissionV1>;
  managerName?: string;
  now?: Date;
  includeHidden?: boolean;
}): ScheduledPaymentMessage[] {
  const settings = input.settings ?? DEFAULT_MANAGER_AUTOMATION_SETTINGS;
  const overrides = input.overrides ?? new Map<string, ScheduledMessageOverride>();
  const sentIds = input.sentDedupIds ?? new Set<string>();
  const listings = input.listingByPropertyId ?? new Map<string, ManagerListingSubmissionV1>();
  const now = input.now ?? new Date();
  const todayKey = dateKey(now);
  const managerName = input.managerName?.trim() || "Your property manager";
  const rows: ScheduledPaymentMessage[] = [];

  for (const charge of input.charges) {
    if (charge.status === "paid") continue;
    if (charge.residentEmail.trim().toLowerCase().endsWith("@axis.local")) continue;

    const dueDate = householdChargeDueDate(charge);
    if (!dueDate) continue;

    const dueDateLabel = chargeDueLabel(charge);
    const dueStart = startOfLocalDay(dueDate);
    const daysUntilDue = daysBetween(startOfLocalDay(now), dueStart);

    const baseParams = {
      residentName: charge.residentName || "Resident",
      chargeTitle: charge.title,
      balanceDue: charge.balanceLabel,
      propertyLabel: charge.propertyLabel,
      managerName,
      dueDateLabel,
      daysUntilDue: Math.max(0, daysUntilDue),
      lateFeeAmount: "",
      graceDays: settings.lateFeeNoticeDaysAfterDue,
    };

    for (const daysBeforeDue of settings.preDueReminderDays) {
      if (daysBeforeDue <= 0) continue;
      const sendAt = computePreDueSendAt(dueStart, daysBeforeDue);
      if (sendAt.getTime() > dueStart.getTime()) continue;

      const visibleFrom = addDays(sendAt, -settings.scheduleVisibilityDays);
      if (!input.includeHidden && !isVisible(settings, sendAt, visibleFrom, now)) continue;
      if (sendAt.getTime() < startOfLocalDay(now).getTime() && !isSent(sentIds, "pre_due", charge.id, daysBeforeDue, todayKey)) {
        // Past send date but not sent — still show until sent or charge paid
      } else if (sendAt.getTime() < startOfLocalDay(now).getTime() && isSent(sentIds, "pre_due", charge.id, daysBeforeDue, todayKey)) {
        // show as sent in schedule if within visibility
      }

      const override = resolveOverride(overrides, input.managerUserId, charge.id, "pre_due", daysBeforeDue);
      const effectiveDays = override?.customDaysBeforeDue ?? daysBeforeDue;
      const effectiveSendAt = computePreDueSendAt(dueStart, effectiveDays);
      const cancelled =
        override?.cancelled === true ||
        isLegacyReminderCancelled(charge.cancelledReminders, "pre_due", effectiveDays);
      const sent = isSent(sentIds, "pre_due", charge.id, effectiveDays, todayKey);
      const content = buildReminderContent({
        kind: "pre_due",
        daysBeforeDue: effectiveDays,
        settings,
        override,
        params: { ...baseParams, daysUntilDue: effectiveDays },
      });

      rows.push({
        id: scheduledMessageListId({ chargeId: charge.id, kind: "pre_due", daysBeforeDue: effectiveDays, sendAt: effectiveSendAt }),
        chargeId: charge.id,
        kind: "pre_due",
        daysBeforeDue: effectiveDays,
        sendAt: effectiveSendAt.toISOString(),
        visibleFrom: addDays(effectiveSendAt, -settings.scheduleVisibilityDays).toISOString(),
        dueDate: dueStart.toISOString(),
        dueDateLabel,
        residentName: charge.residentName || "Resident",
        residentEmail: charge.residentEmail.trim().toLowerCase(),
        chargeTitle: charge.title,
        propertyLabel: charge.propertyLabel,
        balanceDue: charge.balanceLabel,
        subject: content.subject,
        body: content.body,
        status: sent ? "sent" : cancelled ? "cancelled" : "scheduled",
        managerUserId: input.managerUserId,
        typeLabel: typeLabel("pre_due", effectiveDays),
      });
    }

    if (settings.sameDayReminderEnabled && daysUntilDue >= 0) {
      const sendAt = dueStart;
      const visibleFrom = addDays(sendAt, -settings.scheduleVisibilityDays);
      if (input.includeHidden || isVisible(settings, sendAt, visibleFrom, now)) {
        const override = resolveOverride(overrides, input.managerUserId, charge.id, "same_day", null);
        const cancelled =
          override?.cancelled === true || isLegacyReminderCancelled(charge.cancelledReminders, "same_day");
        const sent = isSent(sentIds, "same_day", charge.id, null, todayKey);
        const content = buildReminderContent({
          kind: "same_day",
          settings,
          override,
          params: { ...baseParams, daysUntilDue: 0 },
        });
        rows.push({
          id: scheduledMessageListId({ chargeId: charge.id, kind: "same_day", daysBeforeDue: null, sendAt }),
          chargeId: charge.id,
          kind: "same_day",
          daysBeforeDue: null,
          sendAt: sendAt.toISOString(),
          visibleFrom: visibleFrom.toISOString(),
          dueDate: dueStart.toISOString(),
          dueDateLabel,
          residentName: charge.residentName || "Resident",
          residentEmail: charge.residentEmail.trim().toLowerCase(),
          chargeTitle: charge.title,
          propertyLabel: charge.propertyLabel,
          balanceDue: charge.balanceLabel,
          subject: content.subject,
          body: content.body,
          status: sent ? "sent" : cancelled ? "cancelled" : "scheduled",
          managerUserId: input.managerUserId,
          typeLabel: typeLabel("same_day", null),
        });
      }
    }

    if (daysUntilDue < 0 && settings.overdueDailyEnabled) {
      const daysPastDue = Math.abs(daysUntilDue);
      if (daysPastDue >= settings.overdueDailyStartDays) {
        const sendAt = startOfLocalDay(now);
        const visibleFrom = addDays(sendAt, -settings.scheduleVisibilityDays);
        if (input.includeHidden || isVisible(settings, sendAt, visibleFrom, now)) {
          const override = resolveOverride(overrides, input.managerUserId, charge.id, "overdue_daily", null);
          const cancelled =
            override?.cancelled === true || isLegacyReminderCancelled(charge.cancelledReminders, "overdue_daily");
          const sent = isSent(sentIds, "overdue_daily", charge.id, null, todayKey);
          const content = buildReminderContent({
            kind: "overdue_daily",
            settings,
            override,
            params: { ...baseParams, daysUntilDue: -daysPastDue },
          });
          rows.push({
            id: scheduledMessageListId({ chargeId: charge.id, kind: "overdue_daily", daysBeforeDue: null, sendAt }),
            chargeId: charge.id,
            kind: "overdue_daily",
            daysBeforeDue: null,
            sendAt: sendAt.toISOString(),
            visibleFrom: visibleFrom.toISOString(),
            dueDate: dueStart.toISOString(),
            dueDateLabel,
            residentName: charge.residentName || "Resident",
            residentEmail: charge.residentEmail.trim().toLowerCase(),
            chargeTitle: charge.title,
            propertyLabel: charge.propertyLabel,
            balanceDue: charge.balanceLabel,
            subject: content.subject,
            body: content.body,
            status: sent ? "sent" : cancelled ? "cancelled" : "scheduled",
            managerUserId: input.managerUserId,
            typeLabel: typeLabel("overdue_daily", null),
          });
        }
      }
    }

    const listing = listings.get(charge.propertyId);
    const policy = lateFeePolicyFromSubmission(listing);
    const lateEligible = ["rent", "utilities", "first_month_rent", "prorated_rent", "prorated_utilities", "move_in_fee"].includes(
      charge.kind,
    );
    if (lateEligible && settings.lateFeeNoticeEnabled && policy.enabled && daysUntilDue < 0) {
      const graceDays = policy.graceDays;
      const sendAt = addDays(dueStart, graceDays);
      if (sendAt.getTime() >= startOfLocalDay(now).getTime() || daysBetween(dueStart, now) >= graceDays) {
        const visibleFrom = addDays(sendAt, -settings.scheduleVisibilityDays);
        if (input.includeHidden || isVisible(settings, sendAt, visibleFrom, now)) {
          const override = resolveOverride(overrides, input.managerUserId, charge.id, "late_fee", null);
          const cancelled = override?.cancelled === true;
          const lateFeeId = `hc_late_fee_${charge.id}`;
          const sent = sentIds.has(`late_fee_notice_${lateFeeId}`);
          const content = buildReminderContent({
            kind: "late_fee",
            settings,
            override,
            params: {
              ...baseParams,
              lateFeeAmount: policy.amountLabel,
              graceDays,
              daysUntilDue: -daysBetween(dueStart, now),
            },
          });
          rows.push({
            id: scheduledMessageListId({ chargeId: charge.id, kind: "late_fee", daysBeforeDue: null, sendAt }),
            chargeId: charge.id,
            kind: "late_fee",
            daysBeforeDue: null,
            sendAt: sendAt.toISOString(),
            visibleFrom: visibleFrom.toISOString(),
            dueDate: dueStart.toISOString(),
            dueDateLabel,
            residentName: charge.residentName || "Resident",
            residentEmail: charge.residentEmail.trim().toLowerCase(),
            chargeTitle: charge.title,
            propertyLabel: charge.propertyLabel,
            balanceDue: policy.amountLabel,
            subject: content.subject,
            body: content.body,
            status: sent ? "sent" : cancelled ? "cancelled" : "scheduled",
            managerUserId: input.managerUserId,
            typeLabel: typeLabel("late_fee", null),
          });
        }
      }
    }
  }

  return rows.sort((a, b) => a.sendAt.localeCompare(b.sendAt));
}

export function shouldSendScheduledMessage(message: ScheduledPaymentMessage, now = new Date()): boolean {
  if (message.status !== "scheduled") return false;
  return dateKey(new Date(message.sendAt)) === dateKey(now);
}

export function upcomingScheduledForCharge(
  messages: ScheduledPaymentMessage[],
  chargeId: string,
  limit = 3,
): ScheduledPaymentMessage[] {
  return messages
    .filter((m) => m.chargeId === chargeId && m.status === "scheduled")
    .slice(0, limit);
}
