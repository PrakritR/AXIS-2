import { describe, expect, it } from "vitest";
import type { DemoApplicantRow } from "@/data/demo-portal";
import type { HouseholdCharge } from "@/lib/household-charges";
import { householdChargeManagerBucket, householdChargeToLedgerRow } from "@/lib/household-charges";
import {
  managerPaymentBucketCounts,
  scopeChargesToManagerPaymentsLedger,
  shouldExcludePaymentAccount,
  unpaidManagerPaymentCharges,
} from "@/lib/manager-payments-scope";

/**
 * F-PAY-1: the dashboard "Payments" group advertised "View all 85 →" against a
 * Payments page listing 64, and "80 pending" against a Pending tab reading 58,
 * because Payments narrowed the charge list by two rules the dashboard never
 * applied. Both surfaces now scope through `manager-payments-scope`.
 */

function charge(over: Partial<HouseholdCharge> & Pick<HouseholdCharge, "id">): HouseholdCharge {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    residentEmail: "resident@example.com",
    residentName: "Resident Example",
    residentUserId: null,
    propertyId: "prop-1",
    propertyLabel: "Prop One",
    managerUserId: "mgr-1",
    kind: "rent",
    title: "Rent",
    amountLabel: "$100.00",
    balanceLabel: "$100.00",
    status: "pending",
    blocksLeaseUntilPaid: false,
    ...over,
  } as HouseholdCharge;
}

function application(over: Partial<DemoApplicantRow> & Pick<DemoApplicantRow, "id">): DemoApplicantRow {
  return {
    name: "Resident Example",
    property: "Prop One",
    stage: "Approved",
    bucket: "approved",
    backgroundCheckStatus: "pending_review",
    detail: "",
    email: "resident@example.com",
    ...over,
  } as DemoApplicantRow;
}

describe("manager payments scope (F-PAY-1)", () => {
  it("drops internal payer accounts the Payments page never shows", () => {
    expect(shouldExcludePaymentAccount("Sharad Ramachandran", "x@y.com")).toBe(true);
    expect(shouldExcludePaymentAccount("Someone", "sharad@y.com")).toBe(true);
    expect(shouldExcludePaymentAccount("Maya Chen", "maya@y.com")).toBe(false);
  });

  it("drops charges for a payer who is no longer a current resident", () => {
    const charges = [
      charge({ id: "current" }),
      charge({ id: "previous", residentEmail: "gone@example.com" }),
    ];
    const apps = [
      application({ id: "a1" }),
      application({ id: "a2", email: "gone@example.com", bucket: "pending", stage: "Submitted" }),
    ];
    const scoped = scopeChargesToManagerPaymentsLedger(charges, apps);
    expect(scoped.map((c) => c.id)).toEqual(["current"]);
  });

  it("keeps a manager-entered one-off after the payer moves to Previous", () => {
    const charges = [
      charge({ id: "hc_mgr_one_off", residentEmail: "gone@example.com", kind: "other_cost" }),
    ];
    const apps = [application({ id: "a2", email: "gone@example.com", bucket: "pending", stage: "Submitted" })];
    expect(scopeChargesToManagerPaymentsLedger(charges, apps).map((c) => c.id)).toEqual(["hc_mgr_one_off"]);
  });

  it("the dashboard's unpaid count equals the Payments Pending + Overdue tabs", () => {
    const charges = [
      charge({ id: "pending", dueDateLabel: "2099-01-01" }),
      charge({ id: "overdue", dueDateLabel: "2020-01-01" }),
      charge({ id: "clearing", status: "processing", dueDateLabel: "2020-01-01" }),
      charge({ id: "paid", status: "paid", paidAt: "2026-02-01", balanceLabel: "$0.00" }),
      // Excluded from BOTH surfaces by the shared scope.
      charge({ id: "internal", residentName: "Sharad Ramachandran" }),
    ];
    const scoped = scopeChargesToManagerPaymentsLedger(charges, [application({ id: "a1" })]);
    const counts = managerPaymentBucketCounts(scoped);

    // What the Payments tabs render, derived independently through the ledger row.
    const tabCounts = { pending: 0, overdue: 0, paid: 0 };
    for (const c of scoped) tabCounts[householdChargeToLedgerRow(c).bucket] += 1;

    expect(counts).toEqual(tabCounts);
    // The dashboard group: total = Pending + Overdue, never Paid.
    expect(unpaidManagerPaymentCharges(scoped)).toHaveLength(counts.pending + counts.overdue);
    expect(scoped.map((c) => c.id)).not.toContain("internal");
  });

  it("buckets a clearing ACH charge as Pending on both surfaces, never Overdue", () => {
    const clearing = charge({ id: "clearing", status: "processing", dueDateLabel: "2020-01-01" });
    expect(householdChargeManagerBucket(clearing)).toBe("pending");
    expect(householdChargeToLedgerRow(clearing).bucket).toBe("pending");
    // It used to be invisible to the dashboard, which filtered on status === "pending".
    expect(unpaidManagerPaymentCharges([clearing])).toHaveLength(1);
  });
});
