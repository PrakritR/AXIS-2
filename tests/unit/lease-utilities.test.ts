import { describe, expect, it } from "vitest";
import {
  defaultLeaseUtilities,
  leaseUtilityAllowanceNote,
  leaseUtilityDefaultsFor,
  leaseUtilityKindLabel,
  leaseUtilityPaidByLabel,
  leaseUtilitySetUpByLabel,
  normalizeLeaseUtilities,
  type LeaseUtilityLine,
} from "@/lib/lease-utilities";

describe("lease-utilities", () => {
  it("seeds standard utilities with defaults derived from the aggregate model", () => {
    const included = defaultLeaseUtilities("included_in_rent");
    expect(included).toHaveLength(6);
    expect(included.every((l) => l.paidBy === "included_in_rent")).toBe(true);
    expect(included.every((l) => l.setUpBy === "manager")).toBe(true);
    expect(included.map((l) => l.kind)).toContain("electricity");
    expect(included.map((l) => l.kind)).toContain("internet");

    const direct = defaultLeaseUtilities("tenant_direct");
    expect(direct.every((l) => l.paidBy === "resident" && l.setUpBy === "resident")).toBe(true);

    const billed = defaultLeaseUtilities("manager_billed");
    expect(billed.every((l) => l.paidBy === "resident" && l.setUpBy === "manager")).toBe(true);

    // Undefined aggregate resolves like normalizeUtilitiesPaymentModel does: manager_billed.
    expect(defaultLeaseUtilities().every((l) => l.paidBy === "resident" && l.setUpBy === "manager")).toBe(true);
    expect(leaseUtilityDefaultsFor(undefined)).toEqual({ paidBy: "resident", setUpBy: "manager" });
  });

  it("normalizes messy input and drops unknown kinds", () => {
    const raw = [
      { kind: "electricity", paidBy: "resident", setUpBy: "resident" },
      { kind: "water", paidBy: "included_in_rent", setUpBy: "manager", allowance: " $50/mo " },
      { kind: "bogus", paidBy: "resident" },
      { kind: "other", paidBy: "manager", setUpBy: "manager", label: "  Landscaping  ", notes: " weekly " },
      "not-an-object",
    ];
    const out = normalizeLeaseUtilities(raw)!;
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ kind: "electricity", paidBy: "resident", setUpBy: "resident" });
    expect(out[1]).toEqual({ kind: "water", paidBy: "included_in_rent", setUpBy: "manager", allowance: "$50/mo" });
    expect(out[2]).toEqual({ kind: "other", paidBy: "manager", setUpBy: "manager", label: "Landscaping", notes: "weekly" });
  });

  it("drops allowance when the utility is not included in rent", () => {
    const out = normalizeLeaseUtilities([
      { kind: "gas", paidBy: "resident", setUpBy: "resident", allowance: "$30" },
    ])!;
    expect(out[0]!.allowance).toBeUndefined();
  });

  it("returns undefined for empty or non-array input", () => {
    expect(normalizeLeaseUtilities(undefined)).toBeUndefined();
    expect(normalizeLeaseUtilities([])).toBeUndefined();
    expect(normalizeLeaseUtilities([{ kind: "nope" }])).toBeUndefined();
  });

  it("formats display labels for the lease document", () => {
    const included: LeaseUtilityLine = {
      kind: "water",
      paidBy: "included_in_rent",
      setUpBy: "manager",
      allowance: "$50/mo",
      notes: "shared meter",
    };
    expect(leaseUtilityKindLabel(included)).toBe("Water");
    expect(leaseUtilityPaidByLabel(included)).toBe("Included in rent");
    expect(leaseUtilitySetUpByLabel(included)).toBe("Landlord");
    expect(leaseUtilityAllowanceNote(included)).toBe("Included up to $50/mo — shared meter");

    const other: LeaseUtilityLine = { kind: "other", paidBy: "resident", setUpBy: "resident" };
    expect(leaseUtilityKindLabel(other)).toBe("Other utility / service");
    expect(leaseUtilityPaidByLabel(other)).toBe("Resident pays");
    expect(leaseUtilitySetUpByLabel(other)).toBe("Resident");
    expect(leaseUtilityAllowanceNote(other)).toBe("");
  });
});
