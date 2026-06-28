import { describe, expect, it } from "vitest";
import {
  chargeDueLabel,
  chargeVisibleToManager,
  dedupeHouseholdCharges,
  duplicateHouseholdChargeIds,
  householdChargeToLedgerRow,
  isHouseholdChargeOverdue,
  mergeHouseholdChargesWithServer,
} from "@/lib/household-charges";
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
    residentName: "Resident",
    propertyId: "prop-1",
    propertyLabel: "Test Property",
    managerUserId: "mgr-1",
    rentMonth: "2026-03",
    createdAt: "2026-01-01T00:00:00.000Z",
    title: "Rent — March 2026",
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

  it("maps paid charges to the paid bucket even when due date is in the past", () => {
    const paid = makeCharge({
      status: "paid",
      paidAt: "2026-06-01T12:00:00.000Z",
      balanceLabel: "$0.00",
      dueDateLabel: "Jan 1, 2020",
    });
    expect(householdChargeToLedgerRow(paid).bucket).toBe("paid");
    expect(householdChargeToLedgerRow(paid).statusLabel).toBe("Paid");
  });
});

describe("mergeHouseholdChargesWithServer", () => {
  it("keeps local paid status when server still has pending for the same charge id", () => {
    const server = makeCharge({ id: "chg-1", status: "pending" });
    const local = makeCharge({
      id: "chg-1",
      status: "paid",
      paidAt: "2026-06-10T12:00:00.000Z",
      balanceLabel: "$0.00",
    });

    const { merged, hasUpdated } = mergeHouseholdChargesWithServer([server], [local]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.status).toBe("paid");
    expect(hasUpdated).toBe(true);
  });

  it("keeps local paid status when server pending row uses a different id for the same bill", () => {
    const server = makeCharge({ id: "server-rent-row", status: "pending" });
    const local = makeCharge({
      id: "local-rent-row",
      status: "paid",
      paidAt: "2026-06-10T12:00:00.000Z",
      balanceLabel: "$0.00",
    });

    const { merged, hasUpdated } = mergeHouseholdChargesWithServer([server], [local]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.status).toBe("paid");
    expect(merged[0]?.id).toBe("local-rent-row");
    expect(hasUpdated).toBe(true);
  });

  it("inherits server paid status when local is still pending", () => {
    const server = makeCharge({
      id: "chg-1",
      status: "paid",
      paidAt: "2026-06-10T12:00:00.000Z",
      balanceLabel: "$0.00",
    });
    const local = makeCharge({ id: "chg-1", status: "pending" });

    const { merged } = mergeHouseholdChargesWithServer([server], [local]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.status).toBe("paid");
  });

  it("dedupes duplicate pending/paid rows to a single paid charge", () => {
    const serverPending = makeCharge({ id: "server-row", status: "pending" });
    const serverPaid = makeCharge({
      id: "paid-row",
      status: "paid",
      paidAt: "2026-06-10T12:00:00.000Z",
      balanceLabel: "$0.00",
    });
    const localPaid = makeCharge({
      id: "local-row",
      status: "paid",
      paidAt: "2026-06-11T12:00:00.000Z",
      balanceLabel: "$0.00",
    });

    const { merged } = mergeHouseholdChargesWithServer([serverPending, serverPaid], [localPaid]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.status).toBe("paid");
  });

  it("dedupes duplicate application-fee rows to one canonical charge id", () => {
    const fallback = makeCharge({
      id: "hc_app_fee_res@test.com_prop1",
      kind: "application_fee",
      residentEmail: "res@test.com",
      propertyId: "prop-1",
      status: "paid",
      paidAt: "2026-06-10T12:00:00.000Z",
      balanceLabel: "$0.00",
      amountLabel: "$50.00",
    });
    const canonical = makeCharge({
      id: "hc_app_fee_app123",
      kind: "application_fee",
      applicationId: "app123",
      residentEmail: "res@test.com",
      propertyId: "prop-1",
      status: "paid",
      paidAt: "2026-06-10T12:00:00.000Z",
      balanceLabel: "$0.00",
      amountLabel: "$50.00",
    });

    const merged = dedupeHouseholdCharges([fallback, canonical]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("hc_app_fee_app123");
    expect(duplicateHouseholdChargeIds([fallback, canonical])).toEqual(["hc_app_fee_res@test.com_prop1"]);
  });
});
