import { describe, it, expect } from "vitest";
import {
  filterOverdueCharges,
  findOwnedOverdueCharge,
  buildRentReminderPreview,
} from "@/lib/tools/domains/payments-logic";
import type { HouseholdCharge } from "@/lib/household-charges";

/**
 * These tests pin the security-critical guarantee from the review: the agent's
 * gated send must re-resolve the charge from the manager's own data by id and
 * never honor a client- or model-supplied target. They run as pure logic with
 * no database, SDK, or network.
 */

function charge(overrides: Partial<HouseholdCharge> = {}): HouseholdCharge {
  return {
    id: "hc_test_1",
    createdAt: "2024-01-01T00:00:00.000Z",
    residentEmail: "Resident@Example.com",
    residentName: "Pat Resident",
    residentUserId: null,
    propertyId: "prop_1",
    propertyLabel: "12 Main St",
    managerUserId: "manager_a",
    kind: "rent",
    title: "Monthly rent",
    amountLabel: "$1,500.00",
    balanceLabel: "$1,500.00",
    status: "pending",
    blocksLeaseUntilPaid: false,
    // Past, non-recurring due date so isHouseholdChargeOverdue resolves overdue.
    dueDateLabel: "Jan 1, 2020",
    ...overrides,
  };
}

describe("filterOverdueCharges", () => {
  it("keeps only overdue, unpaid charges", () => {
    const overdue = charge({ id: "overdue" });
    const paid = charge({ id: "paid", status: "paid" });
    const future = charge({ id: "future", dueDateLabel: "Jan 1, 2999" });
    const result = filterOverdueCharges([overdue, paid, future]);
    expect(result.map((c) => c.id)).toEqual(["overdue"]);
  });
});

describe("findOwnedOverdueCharge (write-gating)", () => {
  const managerCharges = [
    charge({ id: "mine_overdue" }),
    charge({ id: "mine_paid", status: "paid" }),
  ];

  it("returns the charge when it is in the manager's own overdue set", () => {
    expect(findOwnedOverdueCharge(managerCharges, "mine_overdue")?.id).toBe("mine_overdue");
  });

  it("rejects a chargeId that belongs to another landlord (cross-tenant)", () => {
    // The other landlord's charge is simply not present in this manager's set.
    expect(findOwnedOverdueCharge(managerCharges, "landlord_b_charge")).toBeNull();
  });

  it("rejects a charge the manager owns but that is not overdue", () => {
    expect(findOwnedOverdueCharge(managerCharges, "mine_paid")).toBeNull();
  });

  it("rejects empty or whitespace ids", () => {
    expect(findOwnedOverdueCharge(managerCharges, "")).toBeNull();
    expect(findOwnedOverdueCharge(managerCharges, "   ")).toBeNull();
  });
});

describe("buildRentReminderPreview", () => {
  it("derives every outbound field from the charge record, normalizing email", () => {
    const preview = buildRentReminderPreview(charge({ id: "c1" }));
    expect(preview).toMatchObject({
      chargeId: "c1",
      residentName: "Pat Resident",
      residentEmail: "resident@example.com",
      chargeTitle: "Monthly rent",
      balanceDue: "$1,500.00",
      propertyLabel: "12 Main St",
    });
  });
});
