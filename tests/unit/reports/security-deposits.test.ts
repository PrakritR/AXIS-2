import { describe, expect, it } from "vitest";
import {
  postGlDepositDisposition,
  postGlReclassifyDeposit,
} from "@/lib/reports/gl-posting";

describe("postGlDepositDisposition", () => {
  it("builds balanced lines for full refund", async () => {
    const inserted: { lines: { account_code: string; debit_cents: number; credit_cents: number }[] } = {
      lines: [],
    };
    const db = {
      from: (table: string) => {
        if (table === "gl_journal_entries") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      maybeSingle: async () => ({ data: null, error: null }),
                    }),
                  }),
                }),
              }),
            }),
            insert: () => ({
              select: () => ({
                single: async () => ({ data: { id: "je-1" }, error: null }),
              }),
            }),
            delete: () => ({ eq: async () => ({ error: null }) }),
          };
        }
        if (table === "gl_journal_lines") {
          return {
            insert: async (rows: typeof inserted.lines) => {
              inserted.lines = rows;
              return { error: null };
            },
          };
        }
        if (table === "ledger_entries") {
          return { update: () => ({ eq: async () => ({ error: null }) }) };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    await postGlDepositDisposition(db as never, {
      managerUserId: "00000000-0000-4000-8000-000000000001",
      sourceId: "dispose:test",
      entryDate: "2026-07-01",
      refundCents: 100_00,
      withholdCents: 0,
    });

    const debits = inserted.lines.reduce((s, l) => s + l.debit_cents, 0);
    const credits = inserted.lines.reduce((s, l) => s + l.credit_cents, 0);
    expect(debits).toBe(credits);
    expect(inserted.lines.some((l) => l.account_code === "security_deposit_liability")).toBe(true);
    expect(inserted.lines.some((l) => l.account_code === "trust_account_security_deposits")).toBe(true);
  });
});

describe("postGlReclassifyDeposit", () => {
  it("debits other_income and credits liability", async () => {
    const inserted: { lines: { account_code: string; debit_cents: number; credit_cents: number }[] } = {
      lines: [],
    };
    const db = {
      from: (table: string) => {
        if (table === "gl_journal_entries") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      maybeSingle: async () => ({ data: null, error: null }),
                    }),
                  }),
                }),
              }),
            }),
            insert: () => ({
              select: () => ({
                single: async () => ({ data: { id: "je-2" }, error: null }),
              }),
            }),
            delete: () => ({ eq: async () => ({ error: null }) }),
          };
        }
        if (table === "gl_journal_lines") {
          return {
            insert: async (rows: typeof inserted.lines) => {
              inserted.lines = rows;
              return { error: null };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    await postGlReclassifyDeposit(db as never, {
      managerUserId: "00000000-0000-4000-8000-000000000001",
      sourceId: "reclassify:test",
      entryDate: "2026-07-01",
      amountCents: 500_00,
    });

    const incomeLine = inserted.lines.find((l) => l.account_code === "other_income");
    const liabilityLine = inserted.lines.find((l) => l.account_code === "security_deposit_liability");
    expect(incomeLine?.debit_cents).toBe(500_00);
    expect(liabilityLine?.credit_cents).toBe(500_00);
  });
});
