import { describe, expect, it } from "vitest";
import { DEFAULT_MANAGER_AUTOMATION_SETTINGS, scheduledOverrideId } from "@/lib/payment-automation-settings";
import {
  computePreDueSendAt,
  filterScheduledPaymentMessagesForUnpaidCharges,
  filterScheduledPaymentMessagesForVisibility,
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
});
