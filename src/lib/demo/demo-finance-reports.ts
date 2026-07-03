/**
 * Client-built `ReportResult`s for the manager Finances tab in the `/demo`
 * sandbox. The real tab fetches `/api/reports/*` (Supabase `ledger_entries` /
 * `manager_expense_entries`), which requires auth the demo doesn't have — so
 * the demo derives the same shapes locally: income from the seeded household
 * charges (it stays live if a visitor marks a charge paid), expenses from the
 * static demo register. Date-range filters are ignored on purpose: the demo
 * dataset is relative to "now" and should always render populated.
 */
import type { ReportResult } from "@/lib/reports/types";
import { readChargesForManager } from "@/lib/household-charges";
import { centsToUsd } from "@/lib/reports/money";
import { DEMO_MANAGER_USER_ID } from "@/lib/demo/demo-session";
import { demoExpenseRows, PROP_LABEL } from "@/lib/demo/demo-data";

function amountToCents(label: string): number {
  const n = Number.parseFloat(label.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function chargeCategoryLabel(kind: string): string {
  if (kind === "utilities" || kind === "prorated_utilities") return "Utilities";
  if (kind === "late_fee") return "Late fee";
  return "Rent";
}

function demoIncomeReport(propertyId?: string): ReportResult {
  const rows = readChargesForManager(DEMO_MANAGER_USER_ID)
    .filter((charge) => charge.status === "paid" && charge.paidAt)
    .filter((charge) => !propertyId || charge.propertyId === propertyId)
    .sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)))
    .map((charge) => ({
      date: String(charge.paidAt).slice(0, 10),
      description: charge.title,
      category: chargeCategoryLabel(charge.kind),
      amount: charge.amountLabel,
      property: charge.propertyLabel,
      resident: charge.residentName,
    }));
  const totalCents = rows.reduce((sum, row) => sum + amountToCents(row.amount), 0);
  return {
    id: "rent-receipts",
    title: "Rent collection summary",
    columns: [
      { key: "date", label: "Date received", format: "date" },
      { key: "description", label: "Description" },
      { key: "category", label: "Type" },
      { key: "amount", label: "Amount", align: "right", format: "money" },
      { key: "property", label: "Property" },
      { key: "resident", label: "Resident" },
    ],
    rows,
    totals: { date: "Total rent collected", description: "", category: "", amount: centsToUsd(totalCents), property: "", resident: "" },
  };
}

function demoExpensesReport(propertyId?: string): ReportResult {
  const propertyLabel = propertyId ? PROP_LABEL[propertyId] : undefined;
  // The `id` key rides along harmlessly — the Finances table hides it.
  const rows = demoExpenseRows().filter((row) => !propertyLabel || row.property === propertyLabel);
  const totalCents = rows.reduce((sum, row) => sum + amountToCents(row.amount), 0);
  return {
    id: "expenses",
    title: "Property Expense Register (Schedule E)",
    columns: [
      { key: "date", label: "Date", format: "date" },
      { key: "category", label: "Category" },
      { key: "scheduleERef", label: "Sch. E Line" },
      { key: "taxStatus", label: "Tax status" },
      { key: "amount", label: "Amount", align: "right", format: "money" },
      { key: "vendor", label: "Vendor" },
      { key: "memo", label: "Description" },
      { key: "property", label: "Property" },
    ],
    rows,
    totals: { date: "Total expenses", category: "", scheduleERef: "", taxStatus: "", amount: centsToUsd(totalCents), vendor: "", memo: "", property: "" },
  };
}

/** Build the demo stand-in for `/api/reports/<reportId>` (Finances tab only). */
export function buildDemoFinanceReport(reportId: string, propertyId?: string): ReportResult {
  return reportId === "expenses" ? demoExpensesReport(propertyId) : demoIncomeReport(propertyId);
}
