/**
 * Gated manager-financials WRITE tools (plan §7). These are `kind: "write"`, so
 * the agent loop (which exposes only read tools) never calls them directly and
 * `runReadTool` refuses them — they execute only behind the explicit
 * preview/confirm step, per the AGENTS.md write-gating contract. Every handler
 * scopes to `ctx.landlordId` (the authenticated manager), never model input, so
 * cross-landlord writes are structurally impossible. All figures are computed
 * server-side from stored data — the model never supplies a balance or split.
 */
import { z } from "zod";
import { defineTool } from "../registry";
import type { AgentContext } from "../context";
import {
  approveManagerBill,
  createManagerBill,
  payManagerBill,
} from "@/lib/manager-bills.server";
import { upsertManagerBudget } from "@/lib/manager-budgets.server";
import {
  approveOwnerDistribution,
  createOwnerDistribution,
} from "@/lib/manager-owner-distributions.server";
import { reconcileBankStatementLine } from "@/lib/manager-bank-reconciliation.server";
import { computeDispositionSplit, disposeSecurityDeposit, getSecurityDepositById } from "@/lib/reports/security-deposits";

export const createManagerBillTool = defineTool({
  name: "create_manager_bill",
  description:
    "Create a new accounts-payable bill (an unpaid obligation owed to a vendor). Amounts are integer cents. Requires explicit user confirmation. The bill starts in pending_approval and does NOT post an expense until it is paid.",
  kind: "write",
  inputSchema: z
    .object({
      description: z.string().min(1),
      amountCents: z.number().int().positive(),
      dueDate: z.string().optional().describe("ISO date YYYY-MM-DD."),
      vendorId: z.string().optional(),
      workOrderId: z.string().optional(),
      propertyId: z.string().optional(),
      categoryCode: z.string().optional(),
    })
    .strict(),
  handler: async (ctx: AgentContext, input) =>
    createManagerBill(ctx.db, {
      managerUserId: ctx.landlordId,
      description: input.description,
      amountCents: input.amountCents,
      dueDate: input.dueDate,
      vendorId: input.vendorId,
      workOrderId: input.workOrderId,
      propertyId: input.propertyId,
      categoryCode: input.categoryCode,
    }),
});

export const approveManagerBillTool = defineTool({
  name: "approve_manager_bill",
  description:
    "Approve a pending bill so it can be paid. Posts a GL entry (DR expense / CR accounts payable). Requires explicit user confirmation.",
  kind: "write",
  inputSchema: z.object({ billId: z.string().min(1) }).strict(),
  handler: async (ctx: AgentContext, input) =>
    approveManagerBill(ctx.db, ctx.landlordId, input.billId, ctx.userId),
});

export const recordBillPaymentTool = defineTool({
  name: "record_bill_payment",
  description:
    "Mark an approved bill as paid: creates the expense entry and posts the cash-out GL entry (DR accounts payable / CR operating cash). Requires explicit user confirmation.",
  kind: "write",
  inputSchema: z.object({ billId: z.string().min(1) }).strict(),
  handler: async (ctx: AgentContext, input) => payManagerBill(ctx.db, ctx.landlordId, input.billId),
});

const budgetInput = z
  .object({
    fiscalYear: z.number().int().min(2000).max(3000),
    categoryCode: z.string().min(1),
    propertyId: z.string().optional(),
    annualCents: z.number().int().nonnegative().optional().describe("Annual budget in cents, split evenly across 12 months."),
    monthlyAmountsCents: z
      .record(z.string(), z.number().int().nonnegative())
      .optional()
      .describe('Explicit month map { "0": cents, ..., "11": cents }.'),
  })
  .strict();

export const createManagerBudgetTool = defineTool({
  name: "create_manager_budget",
  description:
    "Create a budget for a property/fiscal-year/category (integer cents). Supply either an annual amount (split evenly) or an explicit 12-month map. Requires explicit user confirmation.",
  kind: "write",
  inputSchema: budgetInput,
  handler: async (ctx: AgentContext, input) =>
    upsertManagerBudget(ctx.db, {
      managerUserId: ctx.landlordId,
      propertyId: input.propertyId ?? null,
      fiscalYear: input.fiscalYear,
      categoryCode: input.categoryCode,
      annualCents: input.annualCents ?? null,
      monthlyAmountsCents: input.monthlyAmountsCents ?? null,
    }),
});

export const updateManagerBudgetTool = defineTool({
  name: "update_manager_budget",
  description:
    "Update an existing budget for a property/fiscal-year/category (upsert on the same key). Requires explicit user confirmation.",
  kind: "write",
  inputSchema: budgetInput,
  handler: async (ctx: AgentContext, input) =>
    upsertManagerBudget(ctx.db, {
      managerUserId: ctx.landlordId,
      propertyId: input.propertyId ?? null,
      fiscalYear: input.fiscalYear,
      categoryCode: input.categoryCode,
      annualCents: input.annualCents ?? null,
      monthlyAmountsCents: input.monthlyAmountsCents ?? null,
    }),
});

export const disposeSecurityDepositTool = defineTool({
  name: "dispose_security_deposit",
  description:
    "Dispose a held security deposit at move-out. Supply only the damages/withheld amount in cents; the refund is computed server-side as the remainder of the amount held (the tool computes the split, never the model). Posts the disposition GL entry. Requires explicit user confirmation.",
  kind: "write",
  inputSchema: z
    .object({
      depositId: z.string().min(1),
      withholdCents: z.number().int().nonnegative().optional().describe("Damages withheld, in cents. Omit or 0 = full refund."),
      itemization: z
        .array(z.object({ label: z.string(), amountCents: z.number().int().nonnegative() }))
        .optional(),
      memo: z.string().optional(),
    })
    .strict(),
  handler: async (ctx: AgentContext, input) => {
    const deposit = await getSecurityDepositById(ctx.db, ctx.landlordId, input.depositId);
    if (!deposit) throw new Error("Security deposit not found.");
    const split = computeDispositionSplit(deposit.amountHeldCents, input.withholdCents ?? 0);
    return disposeSecurityDeposit(ctx.db, {
      managerUserId: ctx.landlordId,
      depositId: input.depositId,
      dispositionType: split.dispositionType,
      refundCents: split.refundCents,
      withholdCents: split.withholdCents,
      itemization: input.itemization,
      memo: input.memo,
    });
  },
});

export const createOwnerDistributionTool = defineTool({
  name: "create_owner_distribution",
  description:
    "Create a draft owner distribution statement for a property and period. The distribution total is computed server-side from beginning balance + cash in − cash out − management fee − reserve holdback + adjustments (all integer cents). Requires explicit user confirmation.",
  kind: "write",
  inputSchema: z
    .object({
      propertyId: z.string().min(1),
      ownerId: z.string().optional(),
      periodStart: z.string().describe("ISO date YYYY-MM-DD."),
      periodEnd: z.string().describe("ISO date YYYY-MM-DD."),
      beginningBalanceCents: z.number().int().optional(),
      cashInCents: z.number().int().optional(),
      cashOutCents: z.number().int().optional(),
      managementFeeCents: z.number().int().optional(),
      reserveHoldbackCents: z.number().int().optional(),
      adjustmentsCents: z.number().int().optional(),
      memo: z.string().optional(),
    })
    .strict(),
  handler: async (ctx: AgentContext, input) =>
    createOwnerDistribution(ctx.db, {
      managerUserId: ctx.landlordId,
      propertyId: input.propertyId,
      ownerId: input.ownerId ?? null,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      beginningBalanceCents: input.beginningBalanceCents,
      cashInCents: input.cashInCents,
      cashOutCents: input.cashOutCents,
      managementFeeCents: input.managementFeeCents,
      reserveHoldbackCents: input.reserveHoldbackCents,
      adjustmentsCents: input.adjustmentsCents,
      memo: input.memo,
    }),
});

export const approveOwnerDistributionTool = defineTool({
  name: "approve_owner_distribution",
  description: "Approve a draft owner distribution statement. Requires explicit user confirmation.",
  kind: "write",
  inputSchema: z.object({ distributionId: z.string().min(1) }).strict(),
  handler: async (ctx: AgentContext, input) =>
    approveOwnerDistribution(ctx.db, ctx.landlordId, input.distributionId),
});

export const reconcileBankStatementLineTool = defineTool({
  name: "reconcile_bank_statement_line",
  description:
    "Reconcile a bank statement line: mark it cleared and/or match it to a ledger entry. Ownership is verified server-side through the owning statement. Requires explicit user confirmation.",
  kind: "write",
  inputSchema: z
    .object({
      lineId: z.string().min(1),
      matchedLedgerEntryId: z.string().nullable().optional(),
      cleared: z.boolean().optional(),
    })
    .strict(),
  handler: async (ctx: AgentContext, input) =>
    reconcileBankStatementLine(ctx.db, ctx.landlordId, input.lineId, {
      matchedLedgerEntryId: input.matchedLedgerEntryId,
      cleared: input.cleared,
    }),
});

/** All gated manager-financials write tools, for the confirm-gated registry. */
export const managerFinancialsWriteTools = [
  createManagerBillTool,
  approveManagerBillTool,
  recordBillPaymentTool,
  createManagerBudgetTool,
  updateManagerBudgetTool,
  disposeSecurityDepositTool,
  createOwnerDistributionTool,
  approveOwnerDistributionTool,
  reconcileBankStatementLineTool,
];
