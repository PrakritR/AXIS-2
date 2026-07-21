import { describe, it, expect } from "vitest";
import { agentRegistry, managerWriteRegistry } from "@/lib/tools";
import { toAnthropicTools } from "@/lib/tools/registry";
import { computeDispositionSplit } from "@/lib/reports/security-deposits";
import { computeDistributionCents } from "@/lib/manager-owner-distributions";
import { annualBudgetCents, normalizeMonthlyAmounts } from "@/lib/manager-budgets";
import { computeReconciliationSummary } from "@/lib/manager-bank-reconciliation";

describe("manager financials write tools", () => {
  const writeTools = [...managerWriteRegistry.values()];

  it("registers every gated write tool from plan §7", () => {
    const names = new Set(writeTools.map((t) => t.name));
    for (const expected of [
      "create_manager_bill",
      "approve_manager_bill",
      "record_bill_payment",
      "create_manager_budget",
      "update_manager_budget",
      "dispose_security_deposit",
      "create_owner_distribution",
      "approve_owner_distribution",
      "reconcile_bank_statement_line",
    ]) {
      expect(names.has(expected)).toBe(true);
    }
  });

  it("marks every write tool kind:write", () => {
    for (const tool of writeTools) expect(tool.kind).toBe("write");
  });

  it("exposes every financial write tool in the manager registry so chat can propose it", () => {
    // These were registry-only (and therefore unreachable from the assistant)
    // until each grew a preview. Being IN agentRegistry is what gives the
    // landlord the capability; the preview/confirm gate is what keeps it safe.
    const managerNames = new Set([...agentRegistry.values()].map((t) => t.name));
    for (const tool of writeTools) expect(managerNames.has(tool.name)).toBe(true);
  });

  it("gives every financial write tool a preview, so nothing can execute unseen", () => {
    for (const tool of writeTools) expect(typeof tool.preview).toBe("function");
  });

  it("exposes no write tool to the model loop (readOnly filter is empty)", () => {
    expect(toAnthropicTools(managerWriteRegistry, { readOnly: true })).toHaveLength(0);
  });

  it("never surfaces a tax-identifier tool", () => {
    const names = writeTools.map((t) => t.name.toLowerCase());
    for (const forbidden of ["tax", "w9", "w_9", "1099", "tin", "ssn"]) {
      expect(names.some((n) => n.includes(forbidden))).toBe(false);
    }
  });

  it("has valid, unique tool names", () => {
    const names = writeTools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z0-9_]{1,64}$/);
  });
});

describe("deposit disposition split (tool computes, not the model)", () => {
  it("full refund when nothing is withheld", () => {
    expect(computeDispositionSplit(150000, 0)).toEqual({
      refundCents: 150000,
      withholdCents: 0,
      dispositionType: "full_refund",
    });
  });

  it("itemized partial when some is withheld", () => {
    expect(computeDispositionSplit(150000, 40000)).toEqual({
      refundCents: 110000,
      withholdCents: 40000,
      dispositionType: "itemized_partial",
    });
  });

  it("full withhold when all is withheld", () => {
    expect(computeDispositionSplit(150000, 150000)).toEqual({
      refundCents: 0,
      withholdCents: 150000,
      dispositionType: "full_withhold",
    });
  });

  it("clamps withhold to the amount held (never negative refund)", () => {
    expect(computeDispositionSplit(100000, 999999)).toEqual({
      refundCents: 0,
      withholdCents: 100000,
      dispositionType: "full_withhold",
    });
  });
});

describe("owner distribution math", () => {
  it("applies the industry-standard formula", () => {
    // beginning 100 + cashIn 5000 - cashOut 2000 - fee 500 - reserve 300 + adj 100
    expect(
      computeDistributionCents({
        beginningBalanceCents: 10000,
        cashInCents: 500000,
        cashOutCents: 200000,
        managementFeeCents: 50000,
        reserveHoldbackCents: 30000,
        adjustmentsCents: 10000,
      }),
    ).toBe(10000 + 500000 - 200000 - 50000 - 30000 + 10000);
  });

  it("defaults missing components to zero", () => {
    expect(computeDistributionCents({ cashInCents: 100000 })).toBe(100000);
  });
});

describe("budget normalization", () => {
  it("splits an annual amount across 12 months summing exactly", () => {
    const monthly = normalizeMonthlyAmounts({ annualCents: 120005 });
    expect(annualBudgetCents(monthly)).toBe(120005);
    expect(monthly["0"]).toBe(10000);
    expect(monthly["11"]).toBe(10005);
  });

  it("normalizes an explicit month map to 12 keys", () => {
    const monthly = normalizeMonthlyAmounts({ monthlyAmountsCents: { "0": 5000, "3": 7000 } });
    expect(Object.keys(monthly)).toHaveLength(12);
    expect(monthly["0"]).toBe(5000);
    expect(monthly["3"]).toBe(7000);
    expect(monthly["5"]).toBe(0);
    expect(annualBudgetCents(monthly)).toBe(12000);
  });
});

describe("bank reconciliation summary", () => {
  const line = (amountCents: number, cleared: boolean) => ({
    id: `l${amountCents}`,
    statementId: "s1",
    lineDate: "2026-01-01",
    description: "",
    amountCents,
    matchedLedgerEntryId: null,
    cleared,
  });

  it("ties out when cleared lines bridge opening to closing", () => {
    const summary = computeReconciliationSummary({
      openingBalanceCents: 100000,
      closingBalanceCents: 130000,
      lines: [line(20000, true), line(10000, true), line(5000, false)],
    });
    expect(summary.clearedCents).toBe(30000);
    expect(summary.reconciledBalanceCents).toBe(130000);
    expect(summary.differenceCents).toBe(0);
    expect(summary.isReconciled).toBe(true);
    expect(summary.clearedCount).toBe(2);
  });

  it("flags an out-of-balance statement", () => {
    const summary = computeReconciliationSummary({
      openingBalanceCents: 100000,
      closingBalanceCents: 130000,
      lines: [line(20000, true)],
    });
    expect(summary.differenceCents).toBe(10000);
    expect(summary.isReconciled).toBe(false);
  });
});
