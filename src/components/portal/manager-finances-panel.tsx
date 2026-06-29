"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  ManagerPortalFilterRow,
  ManagerPortalPageShell,
  MANAGER_TABLE_TH,
  PORTAL_SECTION_SURFACE,
} from "@/components/portal/portal-metrics";
import {
  ReportExportButtons,
  ReportFilterBar,
  type ReportFilterState,
} from "@/components/portal/reports/report-filter-bar";
import {
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR,
  PORTAL_TABLE_TD,
  PortalDataTableEmpty,
} from "@/components/portal/portal-data-table";
import type { ReportColumn, ReportResult, ReportRow } from "@/lib/reports/types";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { buildManagerPropertyFilterOptions } from "@/lib/manager-portfolio-access";
import { syncPropertyPipelineFromServer } from "@/lib/demo-property-pipeline";
import { SYSTEM_CHART_ACCOUNTS } from "@/lib/reports/categories";
import { centsToUsd, dollarsToCents } from "@/lib/reports/money";
import {
  MANAGER_VENDORS_EVENT,
  readActiveManagerVendorRows,
  syncManagerVendorsFromServer,
} from "@/lib/manager-vendors-storage";

const HIDDEN_FINANCE_COLS = new Set(["scheduleERef", "id", "workOrderId"]);

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

const FILTER_SELECT_CLASS =
  "h-10 min-w-[10rem] rounded-full border border-border bg-card px-3.5 text-sm text-foreground shadow-[var(--shadow-sm)]";

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
}: {
  report: ReportResult;
  sortKey: string;
  sortDir: "asc" | "desc";
  onHeaderSort: (key: string) => void;
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

  return (
    <div className={PORTAL_DATA_TABLE_WRAP}>
      <div className={PORTAL_DATA_TABLE_SCROLL}>
        <table className="min-w-[720px] w-full border-collapse text-left text-sm">
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
                    {formatCellValue(col, row[col.key])}
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

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Filters</p>
      <div className="flex flex-wrap items-end gap-3">
        {tabId === "income" ? (
          <>
            <label className="flex min-w-[10rem] flex-col gap-1.5 text-xs font-medium text-muted">
              Resident
              <select
                className={FILTER_SELECT_CLASS}
                value={rowFilters.resident}
                onChange={(e) => onChange({ resident: e.target.value })}
              >
                <option value="">All residents</option>
                {residents.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[10rem] flex-col gap-1.5 text-xs font-medium text-muted">
              Type
              <select
                className={FILTER_SELECT_CLASS}
                value={rowFilters.type}
                onChange={(e) => onChange({ type: e.target.value })}
              >
                <option value="">All types</option>
                {types.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <label className="flex min-w-[10rem] flex-col gap-1.5 text-xs font-medium text-muted">
              Category
              <select
                className={FILTER_SELECT_CLASS}
                value={rowFilters.category}
                onChange={(e) => onChange({ category: e.target.value })}
              >
                <option value="">All categories</option>
                {categories.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[10rem] flex-col gap-1.5 text-xs font-medium text-muted">
              Vendor
              <select
                className={FILTER_SELECT_CLASS}
                value={rowFilters.vendor}
                onChange={(e) => onChange({ vendor: e.target.value })}
              >
                <option value="">All vendors</option>
                {vendors.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
    </div>
  );
}

const FINANCE_TABS = [
  { id: "income", label: "Income" },
  { id: "expenses", label: "Expenses" },
] as const;

const TAB_TO_REPORT: Record<string, string> = {
  income: "rent-receipts",
  expenses: "expenses",
};

const DEFAULT_SORT: Record<string, { key: string; dir: "asc" | "desc" }> = {
  income: { key: "date", dir: "desc" },
  expenses: { key: "date", dir: "desc" },
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
};

const EXPENSE_CATEGORIES = SYSTEM_CHART_ACCOUNTS.filter((a) => a.accountType === "expense");

export function ManagerFinancesPanel({
  tabId,
  basePath = "/portal",
}: {
  tabId: string;
  basePath?: string;
}) {
  const { showToast } = useAppUi();
  const { userId, ready } = useManagerUserId();
  const [propertyTick, setPropertyTick] = useState(0);
  const [vendorTick, setVendorTick] = useState(0);
  const [filters, setFilters] = useState(defaultFilters);
  const [report, setReport] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [rowFilters, setRowFilters] = useState(emptyRowFilters);
  const [expenseModal, setExpenseModal] = useState(false);
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft>({
    categoryCode: "maintenance",
    amount: "",
    expenseDate: new Date().toISOString().slice(0, 10),
    memo: "",
    vendorId: "",
    propertyId: "",
  });

  const reportId = TAB_TO_REPORT[tabId] ?? "rent-receipts";
  const [sortKey, setSortKey] = useState(DEFAULT_SORT[tabId]?.key ?? "date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(DEFAULT_SORT[tabId]?.dir ?? "desc");

  const filteredReport = useMemo(
    () => (report ? filterFinanceReport(report, tabId, rowFilters) : null),
    [report, tabId, rowFilters],
  );

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
    void syncPropertyPipelineFromServer({ force: true }).then(() => setPropertyTick((n) => n + 1));
    void syncManagerVendorsFromServer();
    const onVendors = () => setVendorTick((n) => n + 1);
    window.addEventListener(MANAGER_VENDORS_EVENT, onVendors);
    return () => window.removeEventListener(MANAGER_VENDORS_EVENT, onVendors);
  }, [ready, userId]);

  const loadTable = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: filters.from, to: filters.to, backfill: "1" });
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

  async function saveExpense() {
    const amountCents = Math.round(Number.parseFloat(expenseDraft.amount.replace(/[^0-9.]/g, "")) * 100);
    if (!(amountCents > 0)) {
      showToast("Enter a valid amount.");
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

  return (
    <ManagerPortalPageShell
      title="Finances"
      filterRow={
        <ManagerPortalFilterRow>
          {FINANCE_TABS.map((tab) => (
            <Link
              key={tab.id}
              href={`${basePath}/financials/${tab.id}`}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                tabId === tab.id
                  ? "bg-foreground text-background"
                  : "border border-border bg-card text-foreground/80 hover:bg-accent/40"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </ManagerPortalFilterRow>
      }
    >
      <div className={`${PORTAL_SECTION_SURFACE} space-y-5 p-4 sm:p-5`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
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
          />
          <div className="flex flex-wrap gap-2">
            {tabId === "expenses" ? (
              <Button
                variant="outline"
                onClick={() => {
                  setExpenseDraft({
                    categoryCode: "maintenance",
                    amount: "",
                    expenseDate: new Date().toISOString().slice(0, 10),
                    memo: "",
                    vendorId: "",
                    propertyId: filters.propertyId,
                  });
                  setExpenseModal(true);
                }}
              >
                Add expense
              </Button>
            ) : null}
            {report && report.rows.length > 0 ? (
              <ReportExportButtons reportId={reportId} query={query} formats={["csv"]} />
            ) : null}
          </div>
        </div>

        <FinancesRowFilters
          tabId={tabId}
          report={report}
          rowFilters={rowFilters}
          onChange={(next) => setRowFilters((current) => ({ ...current, ...next }))}
        />

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
            />
          )
        ) : (
          <PortalDataTableEmpty message="No finance entries yet." icon="finance" />
        )}
      </div>

      <Modal open={expenseModal} onClose={() => setExpenseModal(false)} title="Add expense">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
            Property
            <select
              className="h-10 rounded-xl border border-border bg-card px-3 text-sm"
              value={expenseDraft.propertyId}
              onChange={(e) => setExpenseDraft({ ...expenseDraft, propertyId: e.target.value })}
            >
              <option value="">All properties / unassigned</option>
              {propertyOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Category
            <select
              className="h-10 rounded-xl border border-border bg-card px-3 text-sm"
              value={expenseDraft.categoryCode}
              onChange={(e) => setExpenseDraft({ ...expenseDraft, categoryCode: e.target.value })}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
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
            <select
              className="h-10 rounded-xl border border-border bg-card px-3 text-sm"
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
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
            Description / memo
            <Input value={expenseDraft.memo} onChange={(e) => setExpenseDraft({ ...expenseDraft, memo: e.target.value })} />
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setExpenseModal(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void saveExpense()}>
            Save expense
          </Button>
        </div>
      </Modal>
    </ManagerPortalPageShell>
  );
}
