import { z } from "zod";
import { defineTool } from "../registry";
import type { AgentContext } from "../context";
import type { ManagerReportFilters, ReportResult } from "@/lib/reports/types";
import {
  queryRentRoll,
  queryDelinquency,
  queryIncomeStatement,
  queryExpenses,
  queryRentReceipts,
  queryRentalDays,
  queryTaxSummary,
  queryLeaseExpiration,
  queryVendorSpend,
} from "@/lib/reports/queries";
import {
  queryBalanceSheet,
  queryCashFlowStatement,
  queryGeneralLedger,
  queryTrialBalance,
  queryPayoutHistory,
  queryTrustAccountBalance,
  queryFinancialDiagnostics,
} from "@/lib/reports/queries/gl-reports";
import {
  queryApAging,
  queryBudgetVsActual,
  queryOwnerStatement,
} from "@/lib/reports/queries/ap-reports";

/**
 * Financial reports the agent may run. The numbers are computed by these query
 * functions from the landlord's own ledger/charges — the model never computes a
 * figure itself. The `1099_candidates` report is intentionally NOT exposed
 * because it reads vendor W-9 / TIN data (`vendor_tax_profiles`); tax identifiers
 * must never reach the model.
 */
const REPORTS = {
  rent_roll: queryRentRoll,
  delinquency: queryDelinquency,
  income_statement: queryIncomeStatement,
  expenses: queryExpenses,
  rent_receipts: queryRentReceipts,
  rental_days: queryRentalDays,
  tax_summary: queryTaxSummary,
  lease_expiration: queryLeaseExpiration,
  vendor_spend: queryVendorSpend,
  trial_balance: queryTrialBalance,
  balance_sheet: queryBalanceSheet,
  general_ledger: queryGeneralLedger,
  cash_flow_statement: queryCashFlowStatement,
  payout_history: queryPayoutHistory,
  trust_account_balance: queryTrustAccountBalance,
  financial_diagnostics: queryFinancialDiagnostics,
  ap_aging: queryApAging,
  budget_vs_actual: queryBudgetVsActual,
  owner_statement: queryOwnerStatement,
} as const satisfies Record<
  string,
  (db: AgentContext["db"], managerUserId: string, filters: ManagerReportFilters) => Promise<ReportResult>
>;

export type FinancialReportName = keyof typeof REPORTS;

export const runFinancialReportTool = defineTool({
  name: "run_financial_report",
  description:
    "Run a financial report over the current landlord's books and return its computed columns, rows, and totals. Reports: rent_roll, delinquency, income_statement, expenses, rent_receipts, rental_days, tax_summary, lease_expiration, vendor_spend, trial_balance, balance_sheet, general_ledger, cash_flow_statement, payout_history, trust_account_balance, financial_diagnostics. All figures come from this tool; never compute or estimate them yourself.",
  kind: "read",
  inputSchema: z
    .object({
      report: z
        .enum(
          Object.keys(REPORTS) as [FinancialReportName, ...FinancialReportName[]],
        )
        .describe("Which financial report to run."),
      propertyId: z.string().optional().describe("Optional: limit to a single property id."),
      from: z.string().optional().describe("Optional ISO date (YYYY-MM-DD) range start."),
      to: z.string().optional().describe("Optional ISO date (YYYY-MM-DD) range end."),
      taxYear: z.number().int().optional().describe("Optional tax year for tax_summary."),
      vendorId: z.string().optional().describe("Optional vendor id for vendor_spend."),
      daysAhead: z.number().int().optional().describe("Optional window for lease_expiration."),
    })
    .strict(),
  handler: async (ctx, input): Promise<ReportResult> => {
    const run = REPORTS[input.report];
    const filters: ManagerReportFilters = {
      propertyId: input.propertyId,
      from: input.from,
      to: input.to,
      taxYear: input.taxYear,
      vendorId: input.vendorId,
      daysAhead: input.daysAhead,
    };
    return run(ctx.db, ctx.landlordId, filters);
  },
});
