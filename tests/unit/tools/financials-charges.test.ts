import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeManagerRowsCtx, managerRow } from "./fake-agent-ctx";

// Mock the report query module so we can assert dispatch + landlord scoping
// without standing up the full ledger/charges query implementations.
vi.mock("@/lib/reports/queries", () => {
  const make = (id: string) =>
    vi.fn(async () => ({ id, title: id, columns: [], rows: [] }));
  return {
    queryRentRoll: make("rent_roll"),
    queryDelinquency: make("delinquency"),
    queryIncomeStatement: make("income_statement"),
    queryExpenses: make("expenses"),
    queryRentReceipts: make("rent_receipts"),
    queryRentalDays: make("rental_days"),
    queryTaxSummary: make("tax_summary"),
    queryLeaseExpiration: make("lease_expiration"),
    queryVendorSpend: make("vendor_spend"),
  };
});

import * as reportQueries from "@/lib/reports/queries";
import { runFinancialReportTool } from "@/lib/tools/domains/financials";
import { listChargesTool } from "@/lib/tools/domains/payments";

describe("run_financial_report", () => {
  beforeEach(() => vi.clearAllMocks());

  it("dispatches to the matching query scoped by the landlord id", async () => {
    const ctx = makeManagerRowsCtx({});
    await runFinancialReportTool.handler(ctx, { report: "rent_roll", propertyId: "p1" });
    expect(reportQueries.queryRentRoll).toHaveBeenCalledTimes(1);
    const [, managerUserId, filters] = (reportQueries.queryRentRoll as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(managerUserId).toBe("manager_a");
    expect(filters).toMatchObject({ propertyId: "p1" });
  });

  it("rejects an unknown report name via the schema", () => {
    const parsed = runFinancialReportTool.inputSchema.safeParse({ report: "1099_candidates" });
    expect(parsed.success).toBe(false);
  });

  it("does not expose vendor tax / 1099 reporting", () => {
    // The tax-profile-reading report must not be a callable option.
    expect(runFinancialReportTool.inputSchema.safeParse({ report: "vendor_spend" }).success).toBe(true);
    expect("query1099Candidates" in reportQueries).toBe(false);
  });
});

describe("list_charges", () => {
  const ctx = makeManagerRowsCtx({
    portal_household_charge_records: [
      managerRow("manager_a", {
        id: "c1",
        residentName: "Pat",
        residentEmail: "Pat@Example.com",
        propertyLabel: "12 Main",
        managerUserId: "manager_a",
        residentUserId: "ru_secret",
        kind: "rent",
        title: "Rent",
        amountLabel: "$1,500.00",
        balanceLabel: "$1,500.00",
        status: "pending",
        dueDateLabel: "Jan 1, 2026",
      }),
      managerRow("manager_a", { id: "c2", residentEmail: "x@y.com", status: "paid", title: "Deposit", kind: "security_deposit" }),
      managerRow("manager_b", { id: "c3", status: "pending", title: "Other" }),
    ],
  });

  it("returns only the landlord's charges and filters by status", async () => {
    const all = (await listChargesTool.handler(ctx, {})) as { count: number; charges: { id: string }[] };
    expect(all.count).toBe(2);
    expect(all.charges.map((c) => c.id).sort()).toEqual(["c1", "c2"]);

    const paid = (await listChargesTool.handler(ctx, { status: "PAID" })) as { charges: { id: string }[] };
    expect(paid.charges.map((c) => c.id)).toEqual(["c2"]);
  });

  it("filters by resident email (case-insensitive) and omits internal id fields", async () => {
    const res = (await listChargesTool.handler(ctx, { residentEmail: "pat@example.com" })) as {
      charges: Record<string, unknown>[];
    };
    expect(res.charges).toHaveLength(1);
    const charge = res.charges[0]!;
    expect(charge).not.toHaveProperty("managerUserId");
    expect(charge).not.toHaveProperty("residentUserId");
    expect(charge.residentEmail).toBe("pat@example.com");
  });
});
