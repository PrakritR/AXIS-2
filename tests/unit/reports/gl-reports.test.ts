import { describe, expect, it, vi } from "vitest";
import { primeSystemChartOfAccounts } from "@/lib/reports/chart-of-accounts-store";
import { queryTrialBalance } from "@/lib/reports/queries/gl-reports";

vi.mock("@/lib/reports/chart-of-accounts-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reports/chart-of-accounts-store")>();
  return {
    ...actual,
    primeSystemChartOfAccounts: vi.fn().mockResolvedValue(undefined),
  };
});

describe("queryTrialBalance", () => {
  it("returns balanced totals when debits equal credits", async () => {
    const entries = [
      {
        id: "je-1",
        entry_date: "2026-01-10",
        memo: "Rent charge",
        source_type: "charge",
        source_id: "c1",
        property_id: null,
        gl_journal_lines: [
          { account_code: "accounts_receivable", debit_cents: 100_000, credit_cents: 0 },
          { account_code: "rent_income", debit_cents: 0, credit_cents: 100_000 },
        ],
      },
      {
        id: "je-2",
        entry_date: "2026-01-11",
        memo: "Rent payment",
        source_type: "payment",
        source_id: "c1",
        property_id: null,
        gl_journal_lines: [
          { account_code: "operating_cash", debit_cents: 100_000, credit_cents: 0 },
          { account_code: "accounts_receivable", debit_cents: 0, credit_cents: 100_000 },
        ],
      },
    ];

    const lte = vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({ data: entries, error: null }),
      }),
    });
    const eqReversal = vi.fn().mockReturnValue({ lte });
    const eqManager = vi.fn().mockReturnValue({ eq: eqReversal });
    const from = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: eqManager }) });

    const result = await queryTrialBalance({ from } as never, "mgr-1", { to: "2026-12-31" });
    expect(result.meta?.balanced).toBe(true);
    expect(result.rows.length).toBeGreaterThan(0);
  });
});
