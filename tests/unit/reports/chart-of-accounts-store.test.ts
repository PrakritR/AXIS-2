import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  categoryCodeForChargeKind,
  chartAccountLabel,
  chartAccountScheduleE,
  isCategoryDeductible,
} from "@/lib/reports/categories";
import {
  getChartOfAccounts,
  resetChartOfAccountsCacheForTests,
  SYSTEM_CHART_ACCOUNTS_FALLBACK,
} from "@/lib/reports/chart-of-accounts-store";

afterEach(() => {
  resetChartOfAccountsCacheForTests();
});

describe("categoryCodeForChargeKind", () => {
  it("books security deposits to the liability account, not income", () => {
    expect(categoryCodeForChargeKind("security_deposit")).toBe("security_deposit_liability");
  });

  it("keeps move-in fees (non-refundable) as income", () => {
    expect(categoryCodeForChargeKind("move_in_fee")).toBe("other_income");
  });

  it("maps the new nsf_fee kind to the nsf_fees income account", () => {
    expect(categoryCodeForChargeKind("nsf_fee")).toBe("nsf_fees");
  });
});

describe("system chart-of-accounts fallback", () => {
  it("defines the liability account for deposits with a credit normal balance", () => {
    const acct = SYSTEM_CHART_ACCOUNTS_FALLBACK.find((a) => a.code === "security_deposit_liability");
    expect(acct).toMatchObject({
      accountType: "liability",
      accountNumber: 2010,
      normalBalance: "credit",
    });
  });

  it("keeps label / Schedule E lookups working without a warmed DB cache", () => {
    expect(chartAccountLabel("rent_income")).toBe("Rent Income");
    expect(chartAccountScheduleE("maintenance")).toEqual({ ref: "Sch. E, Line 14", label: "Repairs" });
    expect(chartAccountScheduleE("security_deposit_liability")).toBeNull();
  });

  it("classifies capital_improvement as the one non-deductible expense", () => {
    expect(isCategoryDeductible("capital_improvement")).toBe(false);
    expect(isCategoryDeductible("maintenance")).toBe(true);
    expect(isCategoryDeductible("unknown_custom_code")).toBe(true);
  });
});

describe("getChartOfAccounts", () => {
  function dbReturning(rows: unknown[] | null, error: { message: string } | null) {
    const result = Promise.resolve({ data: rows, error });
    const query = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn(() => result),
      is: vi.fn(() => result),
    };
    return { from: vi.fn(() => query), query };
  }

  it("falls back to the static system accounts when the DB read fails", async () => {
    const { from } = dbReturning(null, { message: "column does not exist" });
    const rows = await getChartOfAccounts({ from } as unknown as SupabaseClient);
    expect(rows).toBe(SYSTEM_CHART_ACCOUNTS_FALLBACK);
  });

  it("maps DB rows and lets a manager override replace the system row by code", async () => {
    const systemRow = {
      code: "rent_income",
      name: "Rent Income",
      account_type: "income",
      account_number: 4000,
      normal_balance: "credit",
      parent_code: null,
      is_bank_account: false,
      is_trust_account: false,
      is_active: true,
      is_system: true,
      sort_order: 10,
      schedule_e_line: 3,
      schedule_e_ref: "Sch. E, Line 3",
      schedule_e_label: "Rents Received",
    };
    const override = { ...systemRow, name: "Rent (Custom)", is_system: false };
    const result = { data: [systemRow], error: null };
    const overrideResult = { data: [override], error: null };
    const query = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      is: vi.fn(() => Promise.resolve(result)),
      eq: vi.fn(() => Promise.resolve(overrideResult)),
    };
    const db = { from: vi.fn(() => query) } as unknown as SupabaseClient;

    const rows = await getChartOfAccounts(db, "manager-uuid");
    const rent = rows.find((a) => a.code === "rent_income");
    expect(rent?.name).toBe("Rent (Custom)");
    expect(rent?.accountNumber).toBe(4000);
    expect(rent?.normalBalance).toBe("credit");
  });
});
