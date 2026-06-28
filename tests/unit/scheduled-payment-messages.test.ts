import { describe, expect, it } from "vitest";
import { DEFAULT_MANAGER_AUTOMATION_SETTINGS, scheduledOverrideId } from "@/lib/payment-automation-settings";
import {
  computePreDueSendAt,
  projectScheduledPaymentMessages,
  scheduledMessageListId,
  shouldSendScheduledMessage,
} from "@/lib/scheduled-payment-messages";
import type { HouseholdCharge } from "@/lib/household-charges";

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
});
