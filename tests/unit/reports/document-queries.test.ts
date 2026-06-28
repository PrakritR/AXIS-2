import { describe, expect, it, vi } from "vitest";
import {
  queryRentReceipts,
  queryRentalDays,
  queryTaxSummary,
} from "@/lib/reports/queries";

function emptyDisplayContextHandlers() {
  const emptyChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [] }),
  };
  return {
    portal_recurring_rent_profile_records: () => emptyChain,
    manager_application_records: () => ({ select: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [] }) }),
    manager_vendor_records: () => emptyChain,
  };
}

function mockDb(handlers: Record<string, () => unknown>) {
  const from = vi.fn((table: string) => {
    const handler = handlers[table];
    if (!handler) {
      throw new Error(`Unexpected table ${table}`);
    }
    return handler();
  });
  return { from } as never;
}

function queryChain(result: { data: unknown[]; error?: null }, terminal: "lte" | "order" = "lte") {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "gte", "neq"]) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.order = terminal === "order" ? vi.fn().mockResolvedValue(result) : vi.fn().mockReturnValue(chain);
  chain.lte =
    terminal === "lte"
      ? vi.fn().mockResolvedValue(result)
      : vi.fn().mockReturnValue(chain);
  return chain;
}

describe("document report queries", () => {
  it("queryRentReceipts totals paid rent income", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          {
            posted_date: "2026-01-15",
            description: "January rent",
            amount_cents: 150000,
            category_code: "rent_income",
            property_id: "prop-1",
            resident_email: "res@test.com",
          },
          {
            posted_date: "2026-01-20",
            description: "Utilities",
            amount_cents: 5000,
            category_code: "utilities",
            property_id: "prop-1",
            resident_email: "res@test.com",
          },
        ],
      }),
    };
    const db = mockDb({
      ledger_entries: () => chain,
      ...emptyDisplayContextHandlers(),
    });

    const report = await queryRentReceipts(db, "mgr-1", { from: "2026-01-01", to: "2026-01-31" });
    expect(report.id).toBe("rent-receipts");
    expect(report.rows).toHaveLength(1);
    expect(report.totals?.amount).toBe("$1500.00");
    expect(report.meta?.totalEarned).toBe("$1500.00");
  });

  it("queryRentalDays counts occupied days in range", async () => {
    const profileChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [
          {
            row_data: {
              id: "rp-1",
              residentEmail: "res@test.com",
              residentName: "Resident",
              propertyId: "prop-1",
              propertyLabel: "Oak House",
              roomLabel: "Unit A",
              startMonth: "2026-01",
              leaseEnd: "2026-12-31",
              active: true,
              monthlyRent: 1500,
            },
          },
        ],
      }),
    };
    const db = mockDb({
      portal_recurring_rent_profile_records: () => profileChain,
    });

    const report = await queryRentalDays(db, "mgr-1", { from: "2026-01-01", to: "2026-01-31" });
    expect(report.id).toBe("rental-days");
    expect(report.rows[0]?.property).toBe("Oak House");
    expect(Number(report.rows[0]?.daysRented)).toBeGreaterThanOrEqual(30);
    expect(Number(report.meta?.totalDaysRented)).toBeGreaterThanOrEqual(30);
  });

  it("queryTaxSummary aggregates earned, spent, and days rented", async () => {
    const profileChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [
          {
            row_data: {
              propertyId: "prop-1",
              propertyLabel: "Oak House",
              roomLabel: "A",
              residentName: "Res",
              residentEmail: "res@test.com",
              startMonth: "2026-01",
              leaseEnd: "2026-12-31",
              active: true,
              monthlyRent: 2000,
            },
          },
        ],
      }),
    };
    const expenseRows = {
      data: [{ property_id: "prop-1", amount_cents: 25000, category_code: "maintenance", expense_date: "2026-02-01" }],
      error: null as null,
    };
    let expenseCalls = 0;
    const db = mockDb({
      ledger_entries: () => queryChain({
        data: [{ property_id: "prop-1", amount_cents: 200000, category_code: "rent_income" }],
        error: null,
      }),
      manager_expense_entries: () => {
        expenseCalls += 1;
        return queryChain(expenseRows, expenseCalls === 2 ? "order" : "lte");
      },
      portal_recurring_rent_profile_records: () => profileChain,
      manager_application_records: () => ({ select: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [] }) }),
      manager_vendor_records: () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [] }),
      }),
    });

    const report = await queryTaxSummary(db, "mgr-1", { from: "2026-01-01", to: "2026-03-31" });
    expect(report.id).toBe("tax-summary");
    expect(report.meta?.totalEarned).toBe("$2000.00");
    expect(report.meta?.totalSpent).toBe("$250.00");
    expect(Number(report.meta?.totalDaysRented)).toBeGreaterThan(0);
    expect(report.meta?.netIncome).toBe("$1750.00");
  });
});
