import { describe, expect, it } from "vitest";
import {
  defaultDueDateLabelForReminderSettings,
  defaultDueIsoForReminderSettings,
  ensureChargeDueDateForReminders,
} from "@/lib/payment-reminder-bootstrap";
import { DEFAULT_MANAGER_AUTOMATION_SETTINGS } from "@/lib/payment-automation-settings";
import type { HouseholdCharge } from "@/lib/household-charges";

const baseCharge = (overrides: Partial<HouseholdCharge> = {}): HouseholdCharge => ({
  id: "hc_test",
  createdAt: "2026-07-06T12:00:00.000Z",
  residentEmail: "resident@example.com",
  residentName: "Resident",
  propertyId: "prop-1",
  propertyLabel: "Test Property",
  managerUserId: "mgr-1",
  kind: "work_order_charge",
  title: "Test charge",
  amountLabel: "$10.00",
  balanceLabel: "$10.00",
  status: "pending",
  ...overrides,
});

describe("payment-reminder-bootstrap", () => {
  it("defaults due date far enough for pre-due reminder cadence", () => {
    const from = new Date(2026, 6, 6, 12, 0, 0, 0);
    const iso = defaultDueIsoForReminderSettings(DEFAULT_MANAGER_AUTOMATION_SETTINGS, from);
    expect(iso).toBe("2026-07-10");
    expect(defaultDueDateLabelForReminderSettings(DEFAULT_MANAGER_AUTOMATION_SETTINGS, from)).toBe("Jul 10, 2026");
  });

  it("fills missing due date on new pending charges", () => {
    const prepared = ensureChargeDueDateForReminders(baseCharge());
    expect(prepared.dueDateLabel).toBeTruthy();
    expect(prepared.status).toBe("pending");
  });

  it("keeps explicit due dates on pending charges", () => {
    const prepared = ensureChargeDueDateForReminders(
      baseCharge({ dueDateLabel: "Aug 1, 2026" }),
    );
    expect(prepared.dueDateLabel).toBe("Aug 1, 2026");
  });
});
