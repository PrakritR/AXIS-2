import { describe, expect, it, vi } from "vitest";
import { postGlRefundEntry } from "@/lib/reports/gl-posting";

function mockGlDb() {
  const lineInserts: Record<string, unknown>[] = [];
  const from = vi.fn((table: string) => {
    if (table === "gl_journal_entries") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: "je-1" }, error: null }),
          }),
        }),
      };
    }
    if (table === "gl_journal_lines") {
      return {
        insert: vi.fn().mockImplementation((rows: Record<string, unknown>[]) => {
          lineInserts.push(...rows);
          return Promise.resolve({ error: null });
        }),
      };
    }
    return {};
  });
  return { db: { from } as never, lineInserts };
}

describe("postGlRefundEntry", () => {
  it("debits income and credits operating cash", async () => {
    const { db, lineInserts } = mockGlDb();
    await postGlRefundEntry(db, {
      managerUserId: "mgr-1",
      sourceChargeId: "hc-1",
      stripeRefundId: "re_1",
      categoryCode: "rent_income",
      amountCents: 25_000,
      entryDate: "2026-03-01",
    });

    expect(lineInserts.some((r) => r.account_code === "rent_income" && r.debit_cents === 25_000)).toBe(true);
    expect(lineInserts.some((r) => r.account_code === "operating_cash" && r.credit_cents === 25_000)).toBe(true);
  });
});
