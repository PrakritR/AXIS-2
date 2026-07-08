import { describe, expect, it, vi } from "vitest";
import { postGlChargeEntry, postGlPaymentEntry } from "@/lib/reports/gl-posting";

function mockGlDb() {
  const journalInserts: Record<string, unknown>[] = [];
  const lineInserts: Record<string, unknown>[] = [];

  const journalMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const journalInsert = vi.fn().mockImplementation((row: Record<string, unknown>) => ({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { id: `je-${journalInserts.length + 1}` },
        error: null,
      }),
    }),
    then: undefined,
    // track insert payload via mock side effect below
  }));

  const from = vi.fn((table: string) => {
    if (table === "gl_journal_entries") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          maybeSingle: journalMaybeSingle,
        }),
        insert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
          journalInserts.push(row);
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: `je-${journalInserts.length}` },
                error: null,
              }),
            }),
          };
        }),
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
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
    if (table === "ledger_entries") {
      return {
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      };
    }
    return {};
  });

  return { db: { from } as never, journalInserts, lineInserts, journalMaybeSingle };
}

describe("gl-posting", () => {
  it("posts a balanced charge entry (AR debit, income credit)", async () => {
    const { db, lineInserts } = mockGlDb();
    await postGlChargeEntry(db, {
      managerUserId: "mgr-1",
      sourceChargeId: "charge-1",
      categoryCode: "rent_income",
      amountCents: 100_000,
      entryDate: "2026-01-15",
      description: "January rent",
    });

    expect(lineInserts).toHaveLength(2);
    const debits = lineInserts.reduce((s, r) => s + Number(r.debit_cents), 0);
    const credits = lineInserts.reduce((s, r) => s + Number(r.credit_cents), 0);
    expect(debits).toBe(credits);
    expect(lineInserts.some((r) => r.account_code === "accounts_receivable" && r.debit_cents === 100_000)).toBe(true);
    expect(lineInserts.some((r) => r.account_code === "rent_income" && r.credit_cents === 100_000)).toBe(true);
  });

  it("routes security deposit payments to the trust cash account", async () => {
    const { db, lineInserts } = mockGlDb();
    await postGlPaymentEntry(db, {
      managerUserId: "mgr-1",
      sourceChargeId: "charge-dep",
      categoryCode: "security_deposit_liability",
      amountCents: 50_000,
      entryDate: "2026-02-01",
    });

    expect(
      lineInserts.some(
        (r) => r.account_code === "trust_account_security_deposits" && r.debit_cents === 50_000,
      ),
    ).toBe(true);
  });

  it("skips duplicate source postings (idempotent)", async () => {
    const { db, journalMaybeSingle, journalInserts } = mockGlDb();
    journalMaybeSingle.mockResolvedValueOnce({ data: { id: "existing" }, error: null });

    const id = await postGlChargeEntry(db, {
      managerUserId: "mgr-1",
      sourceChargeId: "charge-1",
      categoryCode: "rent_income",
      amountCents: 100_000,
      entryDate: "2026-01-15",
    });

    expect(id).toBe("existing");
    expect(journalInserts).toHaveLength(0);
  });
});
