import { describe, expect, it } from "vitest";
import { chargeDueLabel, chargeVisibleToManager, isHouseholdChargeOverdue } from "@/lib/household-charges";
import type { HouseholdCharge } from "@/lib/household-charges";

function makeCharge(overrides: Partial<HouseholdCharge> = {}): HouseholdCharge {
  return {
    id: "chg-1",
    kind: "rent",
    status: "pending",
    amountLabel: "$100.00",
    balanceLabel: "$100.00",
    dueDateLabel: "Mar 1, 2026",
    residentEmail: "r@test.com",
    managerUserId: "mgr-1",
    ...overrides,
  } as HouseholdCharge;
}

describe("household-charges pure helpers", () => {
  it("detects overdue charges", () => {
    const overdue = makeCharge({ dueDateLabel: "Jan 1, 2020" });
    expect(isHouseholdChargeOverdue(overdue, new Date("2026-06-01"))).toBe(true);
    expect(isHouseholdChargeOverdue(makeCharge({ status: "paid" }), new Date("2026-06-01"))).toBe(false);
  });

  it("returns due label", () => {
    expect(chargeDueLabel(makeCharge({ dueDateLabel: "Due tomorrow" }))).toBe("Due tomorrow");
  });

  it("filters charges visible to manager", () => {
    expect(chargeVisibleToManager(makeCharge({ managerUserId: "mgr-1" }), "mgr-1")).toBe(true);
    expect(chargeVisibleToManager(makeCharge({ managerUserId: "mgr-2" }), "mgr-1")).toBe(false);
  });
});
