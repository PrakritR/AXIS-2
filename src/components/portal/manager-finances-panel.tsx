"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ManagerPortalPageShell, PORTAL_SECTION_SURFACE } from "@/components/portal/portal-metrics";
import {
  ReportExportButtons,
  ReportFilterBar,
  type ReportFilterState,
} from "@/components/portal/reports/report-filter-bar";
import { ReportTable } from "@/components/portal/reports/report-table";
import { FinancialReportDocumentView } from "@/components/portal/reports/formal-document-preview";
import { ReportGeneratePrompt } from "@/components/portal/reports/report-generate-prompt";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { buildManagerPropertyFilterOptions } from "@/lib/manager-portfolio-access";
import { syncPropertyPipelineFromServer } from "@/lib/demo-property-pipeline";
import { SYSTEM_CHART_ACCOUNTS } from "@/lib/reports/categories";
import {
  MANAGER_VENDORS_EVENT,
  readActiveManagerVendorRows,
  syncManagerVendorsFromServer,
} from "@/lib/manager-vendors-storage";
import type { ReportResult } from "@/lib/reports/types";

const FINANCE_TABS = [
  { id: "income", label: "Income" },
  { id: "expenses", label: "Expenses" },
] as const;

const TAB_TO_REPORT: Record<string, string> = {
  income: "rent-receipts",
  expenses: "expenses",
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
  const [generated, setGenerated] = useState(false);
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

  const runReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: filters.from, to: filters.to, backfill: "1" });
      if (filters.propertyId) params.set("propertyId", filters.propertyId);
      const res = await fetch(`/api/reports/${reportId}?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load report.");
      setReport(data as ReportResult);
      setGenerated(true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load report.");
      setReport(null);
      setGenerated(false);
    } finally {
      setLoading(false);
    }
  }, [reportId, filters, showToast]);

  useEffect(() => {
    setReport(null);
    setGenerated(false);
  }, [tabId]);

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
    void runReport();
  }

  const query = (() => {
    const params = new URLSearchParams({ from: filters.from, to: filters.to });
    if (filters.propertyId) params.set("propertyId", filters.propertyId);
    return params.toString();
  })();

  return (
    <ManagerPortalPageShell title="Finances">
      <div className="mb-4 flex flex-wrap gap-2">
        {FINANCE_TABS.map((tab) => (
          <Link
            key={tab.id}
            href={`${basePath}/financials/${tab.id}`}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
              tabId === tab.id
                ? "bg-foreground text-background"
                : "border border-border bg-card text-foreground/80 hover:bg-accent/40"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <div className={`${PORTAL_SECTION_SURFACE} space-y-4 p-4 sm:p-5`}>
        {tabId === "expenses" ? (
          <p className="text-sm text-muted">
            Log property costs — maintenance, utilities, cleaning, insurance, mortgage, vendor work, and other
            expenses. These feed Expense documents and your tax summary.
          </p>
        ) : null}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <ReportFilterBar
            showProperty
            showDateRange
            showDaysAhead={false}
            showTaxYear={false}
            propertyOptions={propertyOptions}
            filters={filters}
            onChange={(next) => setFilters((f) => ({ ...f, ...next }))}
            onRun={() => void runReport()}
            loading={loading}
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
            {generated ? <ReportExportButtons reportId={reportId} query={query} /> : null}
          </div>
        </div>
        {loading ? (
          <ReportGeneratePrompt title="Generating report…" description="Compiling ledger entries for the selected period." />
        ) : !generated ? (
          <ReportGeneratePrompt
            title="Generate financial report"
            description="Choose filters and click Generate report. Your income or expense statement will appear below for review and export."
          />
        ) : report ? (
          <FinancialReportDocumentView report={report} />
        ) : (
          <ReportTable report={report} loading={loading} generated={generated} />
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
