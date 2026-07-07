import { describe, expect, it } from "vitest";
import { DEFAULT_MANAGER_AUTOMATION_SETTINGS, scheduledOverrideId } from "@/lib/payment-automation-settings";
import {
  computePreDueSendAt,
  filterScheduledPaymentMessagesForUnpaidCharges,
  filterScheduledPaymentMessagesForVisibility,
  manageableRemindersForCharge,
  projectScheduledPaymentMessages,
  scheduledMessageListId,
  shouldSendScheduledMessage,
} from "@/lib/scheduled-payment-messages";
import type { HouseholdCharge, RecurringRentProfile } from "@/lib/household-charges";
import { filterChargesEligibleForPaymentReminders } from "@/lib/household-charges";

function makeCharge(overrides: Partial<HouseholdCharge> = {}): HouseholdCharge {
  return {
    id: "hc_rent_test@test.com_prop1_2026-06",
    createdAt: new Date().toISOString(),
    residentEmail: "resident@test.com",
    residentName: "Resident Test",
    residentUserId: null,
    propertyId: "prop-1",
    propertyLabel: "Test Property",
    managerUserId: "mgr-1",
    kind: "rent",
    title: "June rent",
    amountLabel: "$1000.00",
    balanceLabel: "$1000.00",
    status: "pending",
    blocksLeaseUntilPaid: false,
    rentMonth: "2026-06",
    dueDay: 10,
    dueDayMode: "first_of_month",
    ...overrides,
  };
}

function makeRentProfile(overrides: Partial<RecurringRentProfile> = {}): RecurringRentProfile {
  return {
    id: "prof-1",
    residentEmail: "resident@test.com",
    residentName: "Resident Test",
    residentUserId: null,
    propertyId: "prop-1",
    propertyLabel: "Test Property",
    roomLabel: "Room 1",
    managerUserId: "mgr-1",
    monthlyRent: 1000,
    dueDay: 1,
    dueDayMode: "first_of_month",
    startMonth: "2026-06",
    active: true,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("scheduled-payment-messages", () => {
  it("projects pre-due reminders with pipe-safe ids", () => {
    const due = new Date(2026, 5, 10);
    const sendAt = computePreDueSendAt(due, 3);
    const id = scheduledMessageListId({
      chargeId: "hc_rent_test@test.com_prop1_2026-06",
      kind: "pre_due",
      daysBeforeDue: 3,
      sendAt,
    });
    expect(id.split("|").length).toBe(5);
  });

  it("hides future messages when visibility is days_before_send", () => {
    const now = new Date(2026, 4, 1);
    const messages = projectScheduledPaymentMessages({
      managerUserId: "mgr-1",
      charges: [makeCharge()],
      settings: {
        ...DEFAULT_MANAGER_AUTOMATION_SETTINGS,
        preDueReminderDays: [7],
        scheduleVisibilityMode: "days_before_send",
        scheduleVisibilityDays: 2,
      },
      now,
      includeHidden: false,
    });
    expect(messages.length).toBe(0);
  });

  it("shows messages only within days-before-send window", () => {
    const now = new Date(2026, 5, 1);
    const messages = projectScheduledPaymentMessages({
      managerUserId: "mgr-1",
      charges: [makeCharge()],
      settings: {
        ...DEFAULT_MANAGER_AUTOMATION_SETTINGS,
        preDueReminderDays: [7],
        scheduleVisibilityMode: "days_before_send",
        scheduleVisibilityDays: 2,
      },
      now,
      includeHidden: false,
    });
    expect(messages.some((m) => m.kind === "pre_due" && m.daysBeforeDue === 7)).toBe(true);
  });

  it("excludes past scheduled messages from the schedule tab", () => {
    const now = new Date(2026, 5, 15);
    const messages = projectScheduledPaymentMessages({
      managerUserId: "mgr-1",
      charges: [makeCharge()],
      settings: { ...DEFAULT_MANAGER_AUTOMATION_SETTINGS, scheduleVisibilityMode: "all" },
      now,
      includeHidden: false,
    });
    expect(messages.every((m) => new Date(m.sendAt).getTime() >= new Date(2026, 5, 15).setHours(0, 0, 0, 0))).toBe(true);
    expect(messages.every((m) => m.status !== "sent")).toBe(true);
  });

  it("shows all upcoming when visibility mode is all", () => {
    const now = new Date(2026, 4, 1);
    const messages = projectScheduledPaymentMessages({
      managerUserId: "mgr-1",
      charges: [makeCharge()],
      settings: {
        ...DEFAULT_MANAGER_AUTOMATION_SETTINGS,
        preDueReminderDays: [7, 3],
        scheduleVisibilityMode: "all",
      },
      now,
      includeHidden: false,
    });
    expect(messages.some((m) => m.kind === "pre_due" && m.daysBeforeDue === 7)).toBe(true);
  });

  it("marks cancelled overrides as cancelled status", () => {
    const now = new Date(2026, 5, 6);
    const overrides = new Map([
      [
        scheduledOverrideId({
          managerUserId: "mgr-1",
          chargeId: "hc_rent_test@test.com_prop1_2026-06",
          kind: "pre_due",
          daysBeforeDue: 3,
        }),
        { cancelled: true },
      ],
    ]);
    const messages = projectScheduledPaymentMessages({
      managerUserId: "mgr-1",
      charges: [makeCharge()],
      settings: { ...DEFAULT_MANAGER_AUTOMATION_SETTINGS, scheduleVisibilityMode: "all" },
      overrides,
      now,
      includeHidden: true,
    });
    const threeDay = messages.find((m) => m.daysBeforeDue === 3);
    expect(threeDay?.status).toBe("cancelled");
  });

  it("shouldSendScheduledMessage matches send date only for scheduled rows", () => {
    const msg = {
      status: "scheduled" as const,
      sendAt: new Date(2026, 5, 7).toISOString(),
    };
    expect(shouldSendScheduledMessage(msg as never, new Date(2026, 5, 7))).toBe(true);
    expect(shouldSendScheduledMessage(msg as never, new Date(2026, 5, 8))).toBe(false);
  });

  it("skips paid, zero-balance, and paidAt charges", () => {
    const now = new Date(2026, 5, 15);
    const settings = { ...DEFAULT_MANAGER_AUTOMATION_SETTINGS, scheduleVisibilityMode: "all" as const, overdueDailyEnabled: true };
    const paid = projectScheduledPaymentMessages({
      managerUserId: "mgr-1",
      charges: [makeCharge({ status: "paid", balanceLabel: "$0.00", paidAt: now.toISOString() })],
      settings,
      now,
      includeHidden: false,
    });
    const zeroBalance = projectScheduledPaymentMessages({
      managerUserId: "mgr-1",
      charges: [makeCharge({ balanceLabel: "$0.00" })],
      settings,
      now,
      includeHidden: false,
    });
    const paidAtOnly = projectScheduledPaymentMessages({
      managerUserId: "mgr-1",
      charges: [makeCharge({ paidAt: now.toISOString() })],
      settings,
      now,
      includeHidden: false,
    });
    expect(paid).toHaveLength(0);
    expect(zeroBalance).toHaveLength(0);
    expect(paidAtOnly).toHaveLength(0);
  });

  it("filters scheduled messages for paid charges", () => {
    const now = new Date(2026, 5, 15);
    const settings = { ...DEFAULT_MANAGER_AUTOMATION_SETTINGS, scheduleVisibilityMode: "all" as const };
    const charge = makeCharge({ id: "hc_util_may" });
    const messages = projectScheduledPaymentMessages({
      managerUserId: "mgr-1",
      charges: [charge],
      settings,
      now,
      includeHidden: false,
    });
    expect(messages.length).toBeGreaterThan(0);
    const filtered = filterScheduledPaymentMessagesForUnpaidCharges(messages, [
      { ...charge, status: "paid", balanceLabel: "$0.00", paidAt: now.toISOString() },
    ]);
    expect(filtered).toHaveLength(0);
  });

  it("skips stale recurring charges that predate profile startMonth", () => {
    const now = new Date(2026, 5, 28);
    const charge = makeCharge({
      id: "hc_rent_may",
      rentMonth: "2026-05",
      recurringRentProfileId: "prof-1",
      title: "Rent — May 2026",
      dueDay: 1,
    });
    const eligible = filterChargesEligibleForPaymentReminders([charge], [makeRentProfile()]);
    expect(eligible).toHaveLength(0);

    const messages = projectScheduledPaymentMessages({
      managerUserId: "mgr-1",
      charges: eligible,
      settings: { ...DEFAULT_MANAGER_AUTOMATION_SETTINGS, scheduleVisibilityMode: "all", overdueDailyEnabled: true },
      now,
      includeHidden: false,
    });
    expect(messages).toHaveLength(0);
  });

  it("per-charge reminders reflect the full saved default schedule, not the inbox window", () => {
    // Charge due Jun 10; "now" is May 1 so every pre-due send is in the future.
    const now = new Date(2026, 4, 1);
    const savedDays = [7, 5, 3, 2, 1];
    const messages = projectScheduledPaymentMessages({
      managerUserId: "mgr-1",
      charges: [makeCharge()],
      settings: {
        ...DEFAULT_MANAGER_AUTOMATION_SETTINGS,
        preDueReminderDays: savedDays,
        // A narrow inbox window would hide the far-out sends in Inbox → Schedule…
        scheduleVisibilityMode: "days_before_send",
        scheduleVisibilityDays: 2,
      },
      now,
      // …but the per-charge view loads with includeHidden:true, so it sees them all.
      includeHidden: true,
    });

    const manageable = manageableRemindersForCharge(
      messages,
      "hc_rent_test@test.com_prop1_2026-06",
      12,
      now,
    );
    const preDueDays = manageable
      .filter((m) => m.kind === "pre_due")
      .map((m) => m.daysBeforeDue)
      .sort((a, b) => (b ?? 0) - (a ?? 0));
    expect(preDueDays).toEqual(savedDays);
    // Same-day reminder is included too; nothing is dropped by the inbox window.
    expect(manageable.some((m) => m.kind === "same_day")).toBe(true);
  });

  it("per-charge reminders drop past-dated sends", () => {
    // Charge due Jun 10; "now" is Jun 9 so 7d/5d/3d/2d sends are already in the past.
    const now = new Date(2026, 5, 9);
    const messages = projectScheduledPaymentMessages({
      managerUserId: "mgr-1",
      charges: [makeCharge()],
      settings: {
        ...DEFAULT_MANAGER_AUTOMATION_SETTINGS,
        preDueReminderDays: [7, 5, 3, 2, 1],
        scheduleVisibilityMode: "all",
      },
      now,
      includeHidden: true,
    });
    const manageable = manageableRemindersForCharge(
      messages,
      "hc_rent_test@test.com_prop1_2026-06",
      12,
      now,
    );
    // Only the 1-day-before (Jun 9) and due-date (Jun 10) sends remain upcoming.
    expect(manageable.every((m) => new Date(m.sendAt).getTime() >= new Date(2026, 5, 9).setHours(0, 0, 0, 0))).toBe(true);
    expect(manageable.some((m) => m.kind === "pre_due" && m.daysBeforeDue === 1)).toBe(true);
    expect(manageable.some((m) => m.kind === "pre_due" && (m.daysBeforeDue ?? 0) >= 2)).toBe(false);
  });

  it("filters inbox schedule rows to the days-before-send visibility window", () => {
    const now = new Date(2026, 5, 1);
    const settings = {
      ...DEFAULT_MANAGER_AUTOMATION_SETTINGS,
      scheduleVisibilityMode: "days_before_send" as const,
      scheduleVisibilityDays: 3,
    };
    const allMessages = projectScheduledPaymentMessages({
      managerUserId: "mgr-1",
      charges: [
        makeCharge({ id: "hc_a", dueDay: 10 }),
        makeCharge({ id: "hc_b", dueDay: 20, rentMonth: "2026-06" }),
        makeCharge({ id: "hc_c", dueDay: 30, rentMonth: "2026-06" }),
      ],
      settings: { ...settings, scheduleVisibilityMode: "all" },
      now,
      includeHidden: true,
    });
    const visible = filterScheduledPaymentMessagesForVisibility(allMessages, settings, now);
    expect(allMessages.length).toBeGreaterThan(visible.length);
    expect(visible.every((message) => now.getTime() >= new Date(message.visibleFrom).setHours(0, 0, 0, 0))).toBe(true);
  });

  it("gives charges without a parseable due date the daily follow-up stream", () => {
    const now = new Date(2026, 5, 15);
    const charge = makeCharge({
      id: "hc_deposit_1",
      kind: "security_deposit",
      title: "Security deposit",
      rentMonth: undefined,
      dueDay: undefined,
      dueDayMode: undefined,
      dueDateLabel: "Before lease signing",
      createdAt: new Date(2026, 5, 1).toISOString(),
    });
    const messages = projectScheduledPaymentMessages({
      managerUserId: "mgr-1",
      charges: [charge],
      settings: { ...DEFAULT_MANAGER_AUTOMATION_SETTINGS, scheduleVisibilityMode: "all", overdueDailyEnabled: true },
      now,
      includeHidden: true,
    });
    const followUp = messages.find((m) => m.chargeId === "hc_deposit_1" && m.kind === "overdue_daily");
    expect(followUp).toBeDefined();
    expect(new Date(followUp!.sendAt).getTime()).toBe(new Date(2026, 5, 15).getTime());
    expect(manageableRemindersForCharge(messages, "hc_deposit_1", 12, now).length).toBeGreaterThan(0);

    // With daily follow-ups off there is nothing to anchor, so no rows.
    const disabled = projectScheduledPaymentMessages({
      managerUserId: "mgr-1",
      charges: [charge],
      settings: { ...DEFAULT_MANAGER_AUTOMATION_SETTINGS, scheduleVisibilityMode: "all", overdueDailyEnabled: false },
      now,
      includeHidden: true,
    });
    expect(disabled.filter((m) => m.chargeId === "hc_deposit_1")).toHaveLength(0);
  });

  it("waits for overdueDailyStartDays after creation before the first no-due-date follow-up", () => {
    const now = new Date(2026, 5, 15);
    const charge = makeCharge({
      id: "hc_deposit_2",
      kind: "security_deposit",
      rentMonth: undefined,
      dueDateLabel: "Before lease signing",
      createdAt: new Date(2026, 5, 15).toISOString(),
    });
    const messages = projectScheduledPaymentMessages({
      managerUserId: "mgr-1",
      charges: [charge],
      settings: {
        ...DEFAULT_MANAGER_AUTOMATION_SETTINGS,
        scheduleVisibilityMode: "all",
        overdueDailyEnabled: true,
        overdueDailyStartDays: 2,
      },
      now,
      includeHidden: true,
    });
    const followUp = messages.find((m) => m.chargeId === "hc_deposit_2" && m.kind === "overdue_daily");
    expect(followUp).toBeDefined();
    expect(new Date(followUp!.sendAt).getTime()).toBe(new Date(2026, 5, 17).getTime());
  });

  it("projects set-date reminders from settings for every charge, including no-due-date ones", () => {
    const now = new Date(2026, 5, 1);
    const charges = [
      makeCharge(),
      makeCharge({ id: "hc_deposit_3", kind: "security_deposit", rentMonth: undefined, dueDateLabel: "Before lease signing" }),
    ];
    const messages = projectScheduledPaymentMessages({
      managerUserId: "mgr-1",
      charges,
      settings: {
        ...DEFAULT_MANAGER_AUTOMATION_SETTINGS,
        scheduleVisibilityMode: "all",
        setDateReminders: ["2026-06-20"],
      },
      now,
      includeHidden: true,
    });
    const setDates = messages.filter((m) => m.kind === "set_date");
    expect(setDates).toHaveLength(2);
    for (const m of setDates) {
      expect(new Date(m.sendAt).getTime()).toBe(new Date(2026, 5, 20).getTime());
      expect(m.daysBeforeDue).toBe(20260620);
      expect(shouldSendScheduledMessage(m, new Date(2026, 5, 20))).toBe(true);
    }
  });

  it("projects per-charge set-date reminders stored as overrides and honors cancellation", () => {
    const now = new Date(2026, 5, 1);
    const overrides = new Map([
      [
        scheduledOverrideId({
          managerUserId: "mgr-1",
          chargeId: "hc_rent_test@test.com_prop1_2026-06",
          kind: "set_date",
          daysBeforeDue: 20260618,
        }),
        { cancelled: false },
      ],
      [
        scheduledOverrideId({
          managerUserId: "mgr-1",
          chargeId: "hc_rent_test@test.com_prop1_2026-06",
          kind: "set_date",
          daysBeforeDue: 20260622,
        }),
        { cancelled: true },
      ],
    ]);
    const messages = projectScheduledPaymentMessages({
      managerUserId: "mgr-1",
      charges: [makeCharge()],
      settings: { ...DEFAULT_MANAGER_AUTOMATION_SETTINGS, scheduleVisibilityMode: "all" },
      overrides,
      now,
      includeHidden: true,
    });
    const added = messages.find((m) => m.kind === "set_date" && m.daysBeforeDue === 20260618);
    const cancelled = messages.find((m) => m.kind === "set_date" && m.daysBeforeDue === 20260622);
    expect(added?.status).toBe("scheduled");
    expect(new Date(added!.sendAt).getTime()).toBe(new Date(2026, 5, 18).getTime());
    expect(cancelled?.status).toBe("cancelled");
  });

  it("projects default schedule: 3/2/1 before, due date, and 1 day after", () => {
    const now = new Date(2026, 5, 1);
    const messages = projectScheduledPaymentMessages({
      managerUserId: "mgr-1",
      charges: [makeCharge()],
      settings: DEFAULT_MANAGER_AUTOMATION_SETTINGS,
      now,
      includeHidden: true,
    });
    const manageable = manageableRemindersForCharge(
      messages,
      "hc_rent_test@test.com_prop1_2026-06",
      12,
      now,
    );
    expect(manageable.filter((m) => m.kind === "pre_due").map((m) => m.daysBeforeDue).sort((a, b) => (b ?? 0) - (a ?? 0))).toEqual([3, 2, 1]);
    expect(manageable.some((m) => m.kind === "same_day")).toBe(true);
    expect(manageable.some((m) => m.kind === "post_due" && m.daysBeforeDue === 1)).toBe(true);
  });
});
