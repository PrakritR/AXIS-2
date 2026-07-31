"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useShallowTabId } from "@/components/ui/tabs";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { PortalFilterSortSheet, portalFilterActiveCount } from "@/components/portal/portal-filter-sort-sheet";
import { PortalActiveFilterChips, type PortalActiveFilterChip } from "@/components/portal/portal-filter-chips";
import { FilterSingleSelectDropdown } from "@/components/portal/filter-field-lists";
import { FinanceDestinationNav } from "@/components/portal/finance-destination-nav";
import { PortalListControlStack } from "@/components/portal/portal-list-control-stack";
import { PortalPageHeaderMobileActionsRow, PortalSectionActionRow } from "@/components/portal/portal-section-action-row";
import {
  ManagerPortalPageShell,
  MANAGER_TABLE_TH,
} from "@/components/portal/portal-metrics";
import { ManagerBankReconciliationPanel } from "@/components/portal/manager-bank-reconciliation-panel";
import { ManagerBillsPanel } from "@/components/portal/manager-bills-panel";
import { ManagerBudgetsPanel } from "@/components/portal/manager-budgets-panel";
import { ManagerOwnerDistributionsPanel } from "@/components/portal/manager-owner-distributions-panel";
import { ManagerSecurityDepositsPanel } from "@/components/portal/manager-security-deposits-panel";
import { PortalSectionPrimaryButton } from "@/components/portal/portal-list-section";
import {
  ReportExportButtons,
  ReportFilterBar,
  type ReportFilterState,
} from "@/components/portal/reports/report-filter-bar";
import { PORTAL_DATA_TABLE, PortalDataTableColGroup, portalTableColumnPercents, PORTAL_DATA_TABLE_WRAP,
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR,
  PORTAL_TABLE_TD,
  PortalDataTableEmpty,} from "@/components/portal/portal-data-table";
import type { ReportColumn, ReportResult, ReportRow } from "@/lib/reports/types";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { MonthlyProfitChart } from "@/components/portal/monthly-profit-chart";
import {
  readChargesForManager,
  syncHouseholdChargesFromServer,
  HOUSEHOLD_CHARGES_EVENT,
} from "@/lib/household-charges";
import {
  buildManagerPropertyFilterOptions,
  collectLinkedPropertyIdsForModule,
} from "@/lib/manager-portfolio-access";
import {
  MANAGER_OUTGOING_PAYMENTS_EVENT,
  readManagerOutgoingExpenses,
  syncManagerOutgoingExpensesFromServer,
} from "@/lib/manager-outgoing-payments";
import {
  bucketByMonth,
  lastNMonths,
  mergeMonthlyCashflow,
  parseMoneyLabel,
} from "@/lib/portal-monthly-profit";
import { syncPropertyPipelineFromServer } from "@/lib/demo-property-pipeline";
import { expenseTaxStatusLabel, isCategoryDeductible, SYSTEM_CHART_ACCOUNTS } from "@/lib/reports/categories";
import { centsToUsd, dollarsToCents } from "@/lib/reports/money";
import {
  MANAGER_VENDORS_EVENT,
  readActiveManagerVendorRows,
  syncManagerVendorsFromServer,
} from "@/lib/manager-vendors-storage";

const HIDDEN_FINANCE_COLS = new Set(["scheduleERef", "id", "workOrderId", "taxDeductible"]);

type RowFilterState = {
  resident: string;
  type: string;
  category: string;
  vendor: string;
};

function emptyRowFilters(): RowFilterState {
  return { resident: "", type: "", category: "", vendor: "" };
}

function uniqueRowValues(rows: ReportRow[], key: string): string[] {
  const values = new Set<string>();
  for (const row of rows) {
    const value = String(row[key] ?? "").trim();
    if (value && value !== "—") values.add(value);
  }
  return [...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function parseMoneyAmount(raw: unknown): number {
  return dollarsToCents(typeof raw === "string" || typeof raw === "number" ? raw : null);
}

function filterFinanceReport(report: ReportResult, tabId: string, rowFilters: RowFilterState): ReportResult {
  if (LEDGER_TAB_IDS.has(tabId)) return report;
  let rows = report.rows;
  if (tabId === "income") {
    if (rowFilters.resident) rows = rows.filter((row) => String(row.resident ?? "") === rowFilters.resident);
    if (rowFilters.type) rows = rows.filter((row) => String(row.category ?? "") === rowFilters.type);
  } else {
    if (rowFilters.category) rows = rows.filter((row) => String(row.category ?? "") === rowFilters.category);
    if (rowFilters.vendor) rows = rows.filter((row) => String(row.vendor ?? "") === rowFilters.vendor);
  }

  if (!report.totals) return { ...report, rows };

  const filteredTotalCents = rows.reduce((sum, row) => sum + parseMoneyAmount(row.amount), 0);
  const totalLabel = tabId === "income" ? "Total rent collected" : "Total expenses";
  return {
    ...report,
    rows,
    totals: {
      ...report.totals,
      date: totalLabel,
      amount: centsToUsd(filteredTotalCents),
    },
  };
}

function cellAlign(col: ReportColumn) {
  return col.align === "right" ? "text-right tabular-nums" : "text-left";
}

function formatCellValue(col: ReportColumn, raw: unknown): string {
  const text = String(raw ?? "").trim();
  if (!text) return "—";
  if (col.format === "date" && /^\d{4}-\d{2}-\d{2}/.test(text)) {
    const d = new Date(`${text.slice(0, 10)}T12:00:00`);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    }
  }
  return text;
}

function compareRows(a: ReportRow, b: ReportRow, key: string, dir: "asc" | "desc"): number {
  const av = String(a[key] ?? "");
  const bv = String(b[key] ?? "");
  const an = Number.parseFloat(av.replace(/[^0-9.-]/g, ""));
  const bn = Number.parseFloat(bv.replace(/[^0-9.-]/g, ""));
  let cmp = 0;
  if (!Number.isNaN(an) && !Number.isNaN(bn) && (av.includes("$") || bv.includes("$"))) {
    cmp = an - bn;
  } else if (/^\d{4}-\d{2}-\d{2}/.test(av) && /^\d{4}-\d{2}-\d{2}/.test(bv)) {
    cmp = av.localeCompare(bv);
  } else {
    cmp = av.localeCompare(bv, undefined, { sensitivity: "base" });
  }
  return dir === "asc" ? cmp : -cmp;
}

function FinancesDataTable({
  report,
  sortKey,
  sortDir,
  onHeaderSort,
  onTaxStatusChange,
}: {
  report: ReportResult;
  sortKey: string;
  sortDir: "asc" | "desc";
  onHeaderSort: (key: string) => void;
  onTaxStatusChange?: (expenseId: string, deductible: boolean) => void;
}) {
  const visibleCols = useMemo(
    () => report.columns.filter((c) => !HIDDEN_FINANCE_COLS.has(c.key)),
    [report.columns],
  );

  const sortedRows = useMemo(
    () => [...report.rows].sort((a, b) => compareRows(a, b, sortKey, sortDir)),
    [report.rows, sortKey, sortDir],
  );

  if (report.rows.length === 0) {
    return <PortalDataTableEmpty message="No finance entries yet." icon="finance" />;
  }

  const renderCellValue = (col: ReportColumn, row: ReportRow) =>
    col.key === "taxStatus" && onTaxStatusChange && row.id ? (
      <Select
        data-attr="expense-tax-status-inline"
        value={row.taxDeductible === false ? "non_deductible" : "deductible"}
        onChange={(e) => onTaxStatusChange(String(row.id), e.target.value === "deductible")}
      >
        <option value="deductible">Deductible</option>
        <option value="non_deductible">Non-deductible</option>
      </Select>
    ) : (
      formatCellValue(col, row[col.key])
    );

  return (
    <>
      <div className="space-y-2 lg:hidden">
        {sortedRows.map((row, idx) => (
          <div key={`${row.id ?? idx}-${idx}`} className={PORTAL_MOBILE_CARD_CLASS}>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {visibleCols.map((col) => (
                <div key={col.key} className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted/70">{col.label}</p>
                  <div
                    className={`truncate text-sm ${
                      col.key === "amount" || col.key === "property" || col.key === "resident"
                        ? "font-medium text-foreground"
                        : "text-foreground/80"
                    }`}
                  >
                    {renderCellValue(col, row)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {report.totals ? (
          <div className={`${PORTAL_MOBILE_CARD_CLASS} bg-accent/10`}>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {visibleCols.map((col) => (
                <div key={col.key} className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted/70">{col.label}</p>
                  <p className="truncate text-sm font-semibold text-foreground">
                    {formatCellValue(col, report.totals![col.key])}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
      <div className={PORTAL_DATA_TABLE_SCROLL}>
        <table className={PORTAL_DATA_TABLE}>
          <thead>
            <tr className={PORTAL_TABLE_HEAD_ROW}>
              {visibleCols.map((col) => (
                <th
                  key={col.key}
                  className={`${MANAGER_TABLE_TH} ${cellAlign(col)} cursor-pointer select-none hover:bg-accent/30 transition`}
                  onClick={() => onHeaderSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    <span className="text-[10px] text-muted/60">
                      {sortKey === col.key ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, idx) => (
              <tr key={`${row.id ?? idx}-${idx}`} className={PORTAL_TABLE_TR}>
                {visibleCols.map((col) => (
                  <td
                    key={col.key}
                    className={`${PORTAL_TABLE_TD} ${cellAlign(col)} ${
                      col.key === "amount" ? "font-medium text-foreground" : ""
                    } ${col.key === "property" || col.key === "resident" ? "font-medium text-foreground" : ""}`}
                  >
                    {renderCellValue(col, row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {report.totals ? (
            <tfoot>
              <tr className="border-t-2 border-border bg-accent/10 font-semibold text-sm">
                {visibleCols.map((col) => (
                  <td key={col.key} className={`${PORTAL_TABLE_TD} ${cellAlign(col)}`}>
                    {formatCellValue(col, report.totals![col.key])}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      </div>
    </>
  );
}

function FinancesRowFilters({
  tabId,
  report,
  rowFilters,
  onChange,
}: {
  tabId: string;
  report: ReportResult | null;
  rowFilters: RowFilterState;
  onChange: (next: Partial<RowFilterState>) => void;
}) {
  const rows = report?.rows ?? [];
  const residents = useMemo(() => uniqueRowValues(rows, "resident"), [rows]);
  const types = useMemo(() => uniqueRowValues(rows, "category"), [rows]);
  const categories = useMemo(() => uniqueRowValues(rows, "category"), [rows]);
  const vendors = useMemo(() => uniqueRowValues(rows, "vendor"), [rows]);

  if (!report || rows.length === 0) return null;

  return tabId === "income" ? (
    <>
      <FilterSingleSelectDropdown
        label="Resident"
        options={[{ value: "", label: "All residents" }, ...residents.map((value) => ({ value, label: value }))]}
        value={rowFilters.resident}
        onChange={(resident) => onChange({ resident })}
        placeholder="All residents"
        dataAttr="finances-filter-resident"
      />
      <FilterSingleSelectDropdown
        label="Type"
        options={[{ value: "", label: "All types" }, ...types.map((value) => ({ value, label: value }))]}
        value={rowFilters.type}
        onChange={(type) => onChange({ type })}
        placeholder="All types"
        dataAttr="finances-filter-type"
      />
    </>
  ) : (
    <>
      <FilterSingleSelectDropdown
        label="Category"
        options={[{ value: "", label: "All categories" }, ...categories.map((value) => ({ value, label: value }))]}
        value={rowFilters.category}
        onChange={(category) => onChange({ category })}
        placeholder="All categories"
        dataAttr="finances-filter-category"
      />
      <FilterSingleSelectDropdown
        label="Vendor"
        options={[{ value: "", label: "All vendors" }, ...vendors.map((value) => ({ value, label: value }))]}
        value={rowFilters.vendor}
        onChange={(vendor) => onChange({ vendor })}
        placeholder="All vendors"
        dataAttr="finances-filter-vendor"
      />
    </>
  );
}

const FINANCE_TABS = [
  { id: "income", label: "Income" },
  { id: "expenses", label: "Expenses" },
  { id: "trial-balance", label: "Trial balance" },
  { id: "balance-sheet", label: "Balance sheet" },
  { id: "general-ledger", label: "General ledger" },
  { id: "cash-flow-statement", label: "Cash flow" },
  { id: "payout-history", label: "Payout history" },
  { id: "trust-account-balance", label: "Trust account" },
  { id: "security-deposits", label: "Deposits" },
  { id: "financial-diagnostics", label: "Diagnostics" },
  { id: "ap-aging", label: "AP aging" },
  { id: "bills", label: "Bills" },
  { id: "budget-vs-actual", label: "Budget" },
  { id: "bank-reconciliation", label: "Bank rec" },
  { id: "owner-statement", label: "Owner statement" },
  { id: "owner-distributions", label: "Distributions" },
] as const;

const LEDGER_TAB_IDS = new Set([
  "trial-balance",
  "balance-sheet",
  "general-ledger",
  "cash-flow-statement",
  "payout-history",
  "trust-account-balance",
  "financial-diagnostics",
  "ap-aging",
  "budget-vs-actual",
  "owner-statement",
]);

const TAB_TO_REPORT: Record<string, string> = {
  income: "rent-receipts",
  expenses: "expenses",
  "trial-balance": "trial-balance",
  "balance-sheet": "balance-sheet",
  "general-ledger": "general-ledger",
  "cash-flow-statement": "cash-flow-statement",
  "payout-history": "payout-history",
  "trust-account-balance": "trust-account-balance",
  "financial-diagnostics": "financial-diagnostics",
  "ap-aging": "ap-aging",
  "budget-vs-actual": "budget-vs-actual",
  "owner-statement": "owner-statement",
};

const DEFAULT_SORT: Record<string, { key: string; dir: "asc" | "desc" }> = {
  income: { key: "date", dir: "desc" },
  expenses: { key: "date", dir: "desc" },
  "trial-balance": { key: "account", dir: "asc" },
  "balance-sheet": { key: "account", dir: "asc" },
  "general-ledger": { key: "date", dir: "asc" },
  "cash-flow-statement": { key: "line", dir: "asc" },
  "payout-history": { key: "date", dir: "desc" },
  "trust-account-balance": { key: "line", dir: "asc" },
  "financial-diagnostics": { key: "severity", dir: "asc" },
  "ap-aging": { key: "dueDate", dir: "asc" },
  "budget-vs-actual": { key: "category", dir: "asc" },
  "owner-statement": { key: "line", dir: "asc" },
};

function defaultFilters(): ReportFilterState {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  return {
    propertyId: "",
    from: yearStart.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
    daysAhead: "90",
    taxYear: String(now.getFullYear() - 1),
  };
}

type ExpenseDraft = {
  categoryCode: string;
  amount: string;
  expenseDate: string;
  memo: string;
  vendorId: string;
  propertyId: string;
  taxDeductible: boolean;
  // Once the manager touches the tax field, category changes stop re-suggesting it.
  taxTouched: boolean;
};

const EXPENSE_CATEGORIES = SYSTEM_CHART_ACCOUNTS.filter((a) => a.accountType === "expense");
const INCOME_CATEGORIES = SYSTEM_CHART_ACCOUNTS.filter((a) => a.accountType === "income");

type IncomeDraft = {
  categoryCode: string;
  amount: string;
  postedDate: string;
  description: string;
  residentEmail: string;
  propertyId: string;
};

export function ManagerFinancesPanel({
  tabId: serverTabId,
  basePath = "/portal",
}: {
  tabId: string;
  basePath?: string;
}) {
  // Tab switches are shallow (client-only) — see TabNav `shallow` below.
  const tabId = useShallowTabId(
    serverTabId,
    FINANCE_TABS.map((t) => t.id),
  );
  const { showToast } = useAppUi();
  const { userId, ready } = useManagerUserId();
  const [propertyTick, setPropertyTick] = useState(0);
  const [vendorTick, setVendorTick] = useState(0);
  const [cashflowChartTick, setCashflowChartTick] = useState(0);
  const [filters, setFilters] = useState(defaultFilters);
  const [report, setReport] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [rowFilters, setRowFilters] = useState(emptyRowFilters);
  const [expenseModal, setExpenseModal] = useState(false);
  const [incomeModal, setIncomeModal] = useState(false);
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft>({
    categoryCode: "maintenance",
    amount: "",
    expenseDate: new Date().toISOString().slice(0, 10),
    memo: "",
    vendorId: "",
    propertyId: "",
    taxDeductible: isCategoryDeductible("maintenance"),
    taxTouched: false,
  });
  const [incomeDraft, setIncomeDraft] = useState<IncomeDraft>({
    categoryCode: "other_income",
    amount: "",
    postedDate: new Date().toISOString().slice(0, 10),
    description: "",
    residentEmail: "",
    propertyId: "",
  });

  const reportId = TAB_TO_REPORT[tabId] ?? "rent-receipts";
  const [sortKey, setSortKey] = useState(DEFAULT_SORT[tabId]?.key ?? "date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(DEFAULT_SORT[tabId]?.dir ?? "desc");

  const filteredReport = useMemo(
    () => (report ? filterFinanceReport(report, tabId, rowFilters) : null),
    [report, tabId, rowFilters],
  );

  const monthlyProfitPoints = useMemo(() => {
    void cashflowChartTick;
    if (!userId || tabId !== "cash-flow-statement") return [];
    const months = lastNMonths(Date.now(), 24);
    const charges = readChargesForManager(userId, {
      linkedPropertyIds: collectLinkedPropertyIdsForModule(userId, "payments"),
    }).filter((c) => c.status === "paid");
    const scopedCharges = filters.propertyId
      ? charges.filter((c) => c.propertyId === filters.propertyId)
      : charges;
    const expenses = readManagerOutgoingExpenses().filter((e) =>
      filters.propertyId ? e.propertyId === filters.propertyId : true,
    );
    const paymentsByMonth = bucketByMonth(
      scopedCharges,
      months,
      (c) => c.paidAt ?? c.createdAt,
      (c) => parseMoneyLabel(c.amountLabel || c.balanceLabel),
    );
    const expensesByMonth = bucketByMonth(
      expenses,
      months,
      (e) => e.expenseDate,
      (e) => e.amountCents / 100,
    );
    return mergeMonthlyCashflow(paymentsByMonth, expensesByMonth);
  }, [userId, tabId, cashflowChartTick, filters.propertyId]);

  useEffect(() => {
    if (!ready || tabId !== "cash-flow-statement") return;
    void Promise.all([syncHouseholdChargesFromServer(true), syncManagerOutgoingExpensesFromServer()]).then(() =>
      setCashflowChartTick((n) => n + 1),
    );
    const bump = () => setCashflowChartTick((n) => n + 1);
    window.addEventListener(HOUSEHOLD_CHARGES_EVENT, bump);
    window.addEventListener(MANAGER_OUTGOING_PAYMENTS_EVENT, bump);
    return () => {
      window.removeEventListener(HOUSEHOLD_CHARGES_EVENT, bump);
      window.removeEventListener(MANAGER_OUTGOING_PAYMENTS_EVENT, bump);
    };
  }, [ready, tabId, userId]);

  const propertyOptions = useMemo(() => {
    void propertyTick;
    return buildManagerPropertyFilterOptions(userId ?? null);
  }, [userId, propertyTick]);

  const activeVendors = useMemo(() => {
    void vendorTick;
    return readActiveManagerVendorRows();
  }, [userId, vendorTick]);

  useEffect(() => {
    if (!ready) return;
    // Not forced: the pipeline sync has a session TTL + in-flight guard, so
    // tab switches reuse fresh data instead of refetching the full snapshot.
    void syncPropertyPipelineFromServer().then(() => setPropertyTick((n) => n + 1));
    void syncManagerVendorsFromServer();
    const onVendors = () => setVendorTick((n) => n + 1);
    window.addEventListener(MANAGER_VENDORS_EVENT, onVendors);
    return () => window.removeEventListener(MANAGER_VENDORS_EVENT, onVendors);
  }, [ready, userId]);

  const loadTable = useCallback(async () => {
    if (!ready) return;
    if (isDemoModeActive()) {
      // No authenticated reports API in the sandbox — build the same report
      // shapes from the browser-local demo stores instead.
      const { buildDemoFinanceReport } = await import("@/lib/demo/demo-finance-reports");
      setReport(buildDemoFinanceReport(reportId, filters.propertyId || undefined));
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: filters.from, to: filters.to });
      if (filters.propertyId) params.set("propertyId", filters.propertyId);
      const res = await fetch(`/api/reports/${reportId}?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load finances.");
      setReport(data as ReportResult);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load finances.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [reportId, filters, showToast, ready]);

  useEffect(() => {
    const defaults = DEFAULT_SORT[tabId] ?? { key: "date", dir: "desc" as const };
    queueMicrotask(() => {
      setSortKey(defaults.key);
      setSortDir(defaults.dir);
      setRowFilters(emptyRowFilters());
    });
  }, [tabId]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => void loadTable(), 250);
    return () => window.clearTimeout(timer);
  }, [loadTable, ready, tabId]);

  async function saveIncome() {
    const amountCents = Math.round(Number.parseFloat(incomeDraft.amount.replace(/[^0-9.]/g, "")) * 100);
    if (!(amountCents > 0)) {
      showToast("Enter a valid amount.");
      return;
    }
    if (isDemoModeActive()) {
      showToast("Income entries are simulated in this demo.");
      setIncomeModal(false);
      return;
    }
    const res = await fetch("/api/income", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryCode: incomeDraft.categoryCode,
        amountCents,
        postedDate: incomeDraft.postedDate,
        description: incomeDraft.description,
        residentEmail: incomeDraft.residentEmail || undefined,
        propertyId: incomeDraft.propertyId || filters.propertyId || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error ?? "Failed to save income.");
      return;
    }
    showToast("Income saved.");
    setIncomeModal(false);
    void loadTable();
  }

  async function saveExpense() {
    const amountCents = Math.round(Number.parseFloat(expenseDraft.amount.replace(/[^0-9.]/g, "")) * 100);
    if (!(amountCents > 0)) {
      showToast("Enter a valid amount.");
      return;
    }
    if (isDemoModeActive()) {
      showToast("Expenses are simulated in this demo.");
      setExpenseModal(false);
      return;
    }
    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryCode: expenseDraft.categoryCode,
        amountCents,
        expenseDate: expenseDraft.expenseDate,
        memo: expenseDraft.memo,
        vendorId: expenseDraft.vendorId || undefined,
        propertyId: expenseDraft.propertyId || filters.propertyId || undefined,
        taxDeductible: expenseDraft.taxDeductible,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error ?? "Failed to save expense.");
      return;
    }
    showToast("Expense saved.");
    setExpenseModal(false);
    void loadTable();
  }

  async function updateExpenseTaxStatus(expenseId: string, deductible: boolean) {
    if (isDemoModeActive()) {
      showToast("Tax status changes are simulated in this demo.");
      return;
    }
    const res = await fetch("/api/expenses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: expenseId, taxDeductible: deductible }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error ?? "Failed to update tax status.");
      return;
    }
    showToast(`Marked ${expenseTaxStatusLabel(deductible).toLowerCase()}.`);
    void loadTable();
  }

  function onHeaderSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "date" || key === "amount" ? "desc" : "asc");
    }
  }

  const query = (() => {
    const params = new URLSearchParams({ from: filters.from, to: filters.to });
    if (filters.propertyId) params.set("propertyId", filters.propertyId);
    return params.toString();
  })();

  const financeTabItems = useMemo(
    () => FINANCE_TABS.map((tab) => ({ ...tab, href: `${basePath}/financials/${tab.id}` })),
    [basePath],
  );

  const specialFinancePanels = new Set(["bills", "bank-reconciliation", "security-deposits", "owner-distributions"]);
  const showScopedReportFilters = !specialFinancePanels.has(tabId);

  const financeFilterControls = (
    <>
      <ReportFilterBar
        showProperty
        showDateRange
        showDaysAhead={false}
        showTaxYear={false}
        propertyOptions={propertyOptions}
        filters={filters}
        onChange={(next) => setFilters((f) => ({ ...f, ...next }))}
        onRun={() => void loadTable()}
        loading={loading}
        showRunButton={false}
        stacked
        trailing={
          LEDGER_TAB_IDS.has(tabId) ? null : (
            <FinancesRowFilters
              tabId={tabId}
              report={report}
              rowFilters={rowFilters}
              onChange={(next) => setRowFilters((current) => ({ ...current, ...next }))}
            />
          )
        }
      />
    </>
  );

  const resetFinanceFilters = () => {
    setFilters(defaultFilters());
    setRowFilters(emptyRowFilters());
  };

  const financesFilterSheet = showScopedReportFilters ? (
    <PortalFilterSortSheet
      activeCount={portalFilterActiveCount([
        filters.propertyId,
        rowFilters.resident,
        rowFilters.type,
        rowFilters.category,
        rowFilters.vendor,
      ])}
      desktopPresentation="panel"
      className="min-w-0 shrink-0 max-md:w-full max-md:[&_button]:w-full max-md:[&_button]:px-2.5"
      onReset={resetFinanceFilters}
      dataAttr="finances-filter-sheet-open"
    >
      {financeFilterControls}
    </PortalFilterSortSheet>
  ) : null;

  const activeFinanceFilterChips = useMemo((): PortalActiveFilterChip[] => {
    if (!showScopedReportFilters) return [];
    const chips: PortalActiveFilterChip[] = [];
    const defaults = defaultFilters();
    if (filters.propertyId) {
      const label = propertyOptions.find((p) => p.id === filters.propertyId)?.label ?? filters.propertyId;
      chips.push({ id: "property", label: `Property: ${label}`, onRemove: () => setFilters((f) => ({ ...f, propertyId: "" })) });
    }
    if (filters.from !== defaults.from || filters.to !== defaults.to) {
      chips.push({
        id: "dates",
        label: `Dates: ${filters.from} – ${filters.to}`,
        onRemove: () => setFilters((f) => ({ ...f, from: defaults.from, to: defaults.to })),
      });
    }
    if (tabId === "income") {
      if (rowFilters.resident) chips.push({ id: "resident", label: `Resident: ${rowFilters.resident}`, onRemove: () => setRowFilters((f) => ({ ...f, resident: "" })) });
      if (rowFilters.type) chips.push({ id: "type", label: `Type: ${rowFilters.type}`, onRemove: () => setRowFilters((f) => ({ ...f, type: "" })) });
    } else if (tabId === "expenses") {
      if (rowFilters.category) chips.push({ id: "category", label: `Category: ${rowFilters.category}`, onRemove: () => setRowFilters((f) => ({ ...f, category: "" })) });
      if (rowFilters.vendor) chips.push({ id: "vendor", label: `Vendor: ${rowFilters.vendor}`, onRemove: () => setRowFilters((f) => ({ ...f, vendor: "" })) });
    }
    return chips;
  }, [showScopedReportFilters, filters, rowFilters, tabId, propertyOptions]);

  function openAddIncome() {
    setIncomeDraft({
      categoryCode: "other_income",
      amount: "",
      postedDate: new Date().toISOString().slice(0, 10),
      description: "",
      residentEmail: "",
      propertyId: filters.propertyId,
    });
    setIncomeModal(true);
  }

  function openAddExpense() {
    setExpenseDraft({
      categoryCode: "maintenance",
      amount: "",
      expenseDate: new Date().toISOString().slice(0, 10),
      memo: "",
      vendorId: "",
      propertyId: filters.propertyId,
      taxDeductible: isCategoryDeductible("maintenance"),
      taxTouched: false,
    });
    setExpenseModal(true);
  }

  const financesFormalPdfLink =
    tabId === "owner-statement" ? (
      <a
        href={`/api/reports/owner-statement/formal-export?${query}`}
        className="inline-flex h-9 w-full items-center justify-center rounded-full border border-border bg-card px-4 text-xs font-medium text-foreground shadow-[var(--shadow-sm)] hover:bg-accent/40 md:w-auto"
        data-attr="owner-statement-formal-pdf"
      >
        Formal PDF
      </a>
    ) : null;

  const financesExportButtons =
    report && report.rows.length > 0 ? (
      <ReportExportButtons
        reportId={reportId}
        query={query}
        formats={tabId === "general-ledger" ? ["csv", "pdf", "quickbooks"] : ["csv"]}
      />
    ) : tabId === "general-ledger" ? (
      <ReportExportButtons reportId={reportId} query={query} formats={["quickbooks"]} />
    ) : null;

  const financesAddIncomeButton =
    tabId === "income" ? (
      <PortalSectionPrimaryButton
        className="w-full shrink-0 md:w-auto"
        onClick={openAddIncome}
        data-attr="finances-add-income"
      >
        Add income
      </PortalSectionPrimaryButton>
    ) : null;

  const financesAddExpenseButton =
    tabId === "expenses" ? (
      <PortalSectionPrimaryButton
        className="w-full shrink-0 md:w-auto"
        onClick={openAddExpense}
        data-attr="finances-add-expense"
      >
        Add expense
      </PortalSectionPrimaryButton>
    ) : null;

  const financesPrimaryButton = financesAddIncomeButton ?? financesAddExpenseButton;

  const financesDesktopHeaderActions = (
    <PortalSectionActionRow variant="header" className="ml-auto hidden gap-3 md:flex">
      {financesFilterSheet}
      {financesFormalPdfLink}
      {financesExportButtons}
      {financesPrimaryButton}
    </PortalSectionActionRow>
  );

  const financesMobileActionsRow =
    showScopedReportFilters || financesFormalPdfLink || financesExportButtons || financesPrimaryButton ? (
      <PortalPageHeaderMobileActionsRow
        filter={showScopedReportFilters ? financesFilterSheet : undefined}
        actions={
          financesFormalPdfLink || financesExportButtons || financesPrimaryButton ? (
            <PortalSectionActionRow variant="header" className="gap-2">
              {financesFormalPdfLink}
              {financesExportButtons}
              {financesPrimaryButton}
            </PortalSectionActionRow>
          ) : undefined
        }
      />
    ) : null;

  return (
    <ManagerPortalPageShell
      title="Finances"
      titleAside={financesDesktopHeaderActions}
      hideTitleOnMobileNav
      compactFilterRow
    >
      {financesMobileActionsRow}
      <PortalListControlStack
        className="mb-3"
        destinationRow={<FinanceDestinationNav tabId={tabId} tabItems={financeTabItems} basePath={basePath} />}
        activeFilterChips={
          activeFinanceFilterChips.length > 0 ? (
            <PortalActiveFilterChips chips={activeFinanceFilterChips} />
          ) : null
        }
      />
      {tabId === "bills" ? (
        <ManagerBillsPanel />
      ) : tabId === "bank-reconciliation" ? (
        <ManagerBankReconciliationPanel />
      ) : tabId === "security-deposits" ? (
        <ManagerSecurityDepositsPanel />
      ) : tabId === "owner-distributions" ? (
        <ManagerOwnerDistributionsPanel />
      ) : (
      <div className="space-y-5">
        {tabId === "budget-vs-actual" ? <ManagerBudgetsPanel /> : null}
        {tabId === "cash-flow-statement" ? (
          <MonthlyProfitChart points={monthlyProfitPoints} />
        ) : null}

        {loading && !report ? (
          <div className={PORTAL_DATA_TABLE_WRAP}>
            <div className="flex items-center justify-center px-6 py-16 text-sm text-muted">Loading entries…</div>
          </div>
        ) : filteredReport ? (
          filteredReport.rows.length === 0 && report && report.rows.length > 0 ? (
            <PortalDataTableEmpty message="No finance entries match these filters yet." icon="finance" />
          ) : (
            <FinancesDataTable
              report={filteredReport}
              sortKey={sortKey}
              sortDir={sortDir}
              onHeaderSort={onHeaderSort}
              onTaxStatusChange={tabId === "expenses" ? (id, d) => void updateExpenseTaxStatus(id, d) : undefined}
            />
          )
        ) : (
          <PortalDataTableEmpty message="No finance entries yet." icon="finance" />
        )}
      </div>
      )}

      <Modal
        open={expenseModal}
        onClose={() => setExpenseModal(false)}
        title="Add expense"
        footer={
          <ModalFooter>
            <Button variant="primary" onClick={() => void saveExpense()}>
              Save expense
            </Button>
          </ModalFooter>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
            Property
            <Select
              value={expenseDraft.propertyId}
              onChange={(e) => setExpenseDraft({ ...expenseDraft, propertyId: e.target.value })}
            >
              <option value="">All properties / unassigned</option>
              {propertyOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Category
            <Select
              value={expenseDraft.categoryCode}
              onChange={(e) =>
                setExpenseDraft((d) => ({
                  ...d,
                  categoryCode: e.target.value,
                  taxDeductible: d.taxTouched ? d.taxDeductible : isCategoryDeductible(e.target.value),
                }))
              }
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Tax status (suggested from category)
            <Select
              data-attr="expense-tax-status-select"
              value={expenseDraft.taxDeductible ? "deductible" : "non_deductible"}
              onChange={(e) =>
                setExpenseDraft((d) => ({
                  ...d,
                  taxDeductible: e.target.value === "deductible",
                  taxTouched: true,
                }))
              }
            >
              <option value="deductible">Deductible</option>
              <option value="non_deductible">Non-deductible</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Amount (USD)
            <Input value={expenseDraft.amount} onChange={(e) => setExpenseDraft({ ...expenseDraft, amount: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Date
            <Input
              type="date"
              value={expenseDraft.expenseDate}
              onChange={(e) => setExpenseDraft({ ...expenseDraft, expenseDate: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Vendor (optional, for 1099)
            <Select
              value={expenseDraft.vendorId}
              onChange={(e) => setExpenseDraft({ ...expenseDraft, vendorId: e.target.value })}
            >
              <option value="">No vendor</option>
              {activeVendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.trade ? ` · ${v.trade}` : ""}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
            Description / memo
            <Input value={expenseDraft.memo} onChange={(e) => setExpenseDraft({ ...expenseDraft, memo: e.target.value })} />
          </label>
        </div>
      </Modal>

      <Modal
        open={incomeModal}
        onClose={() => setIncomeModal(false)}
        title="Add income"
        footer={
          <ModalFooter>
            <Button variant="primary" onClick={() => void saveIncome()}>
              Save income
            </Button>
          </ModalFooter>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
            Property
            <Select
              value={incomeDraft.propertyId}
              onChange={(e) => setIncomeDraft({ ...incomeDraft, propertyId: e.target.value })}
            >
              <option value="">All properties / unassigned</option>
              {propertyOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Type
            <Select
              value={incomeDraft.categoryCode}
              onChange={(e) => setIncomeDraft({ ...incomeDraft, categoryCode: e.target.value })}
            >
              {INCOME_CATEGORIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Amount (USD)
            <Input value={incomeDraft.amount} onChange={(e) => setIncomeDraft({ ...incomeDraft, amount: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Date received
            <Input
              type="date"
              value={incomeDraft.postedDate}
              onChange={(e) => setIncomeDraft({ ...incomeDraft, postedDate: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Resident email (optional)
            <Input
              type="email"
              value={incomeDraft.residentEmail}
              onChange={(e) => setIncomeDraft({ ...incomeDraft, residentEmail: e.target.value })}
              placeholder="resident@example.com"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
            Description
            <Input
              value={incomeDraft.description}
              onChange={(e) => setIncomeDraft({ ...incomeDraft, description: e.target.value })}
              placeholder="e.g. Utilities reimbursement"
            />
          </label>
        </div>
      </Modal>
    </ManagerPortalPageShell>
  );
}
