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
import { VendorTaxProfileModal } from "@/components/portal/vendor-tax-profile-modal";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { buildManagerPropertyFilterOptions } from "@/lib/manager-portfolio-access";
import { syncPropertyPipelineFromServer } from "@/lib/demo-property-pipeline";
import type { ReportResult } from "@/lib/reports/types";

const TAB_TO_REPORT: Record<string, string> = {
  "rent-roll": "rent-roll",
  delinquency: "delinquency",
  "income-statement": "income-statement",
  expenses: "expenses",
  "lease-expiration": "lease-expiration",
  vendors: "vendor-spend",
  "1099": "1099-candidates",
};

function defaultFilters(): ReportFilterState {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultTaxYear =
    now.getMonth() <= 2 ? now.getFullYear() - 1 : now.getFullYear() - 1;
  return {
    propertyId: "",
    from: monthStart.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
    daysAhead: "90",
    taxYear: String(defaultTaxYear),
  };
}

function buildQuery(reportId: string, filters: ReportFilterState): string {
  const params = new URLSearchParams();
  if (filters.propertyId) params.set("propertyId", filters.propertyId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (reportId === "lease-expiration" && filters.daysAhead) {
    params.set("daysAhead", filters.daysAhead);
  }
  if (reportId === "1099-candidates" && filters.taxYear) {
    params.set("taxYear", filters.taxYear);
  }
  return params.toString();
}

type ExpenseDraft = {
  categoryCode: string;
  amount: string;
  expenseDate: string;
  memo: string;
  vendorId: string;
  propertyId: string;
};

export function ManagerFinancialsPanel({
  tabId,
  basePath = "/portal",
}: {
  tabId: string;
  basePath?: string;
}) {
  const { showToast } = useAppUi();
  const { userId, ready } = useManagerUserId();
  const [propertyTick, setPropertyTick] = useState(0);
  const [filters, setFilters] = useState(defaultFilters);
  const [report, setReport] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expenseModal, setExpenseModal] = useState(false);
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft>({
    categoryCode: "maintenance",
    amount: "",
    expenseDate: new Date().toISOString().slice(0, 10),
    memo: "",
    vendorId: "",
    propertyId: "",
  });
  const [taxVendorId, setTaxVendorId] = useState<string | null>(null);
  const [taxVendorName, setTaxVendorName] = useState("");

  const reportId = TAB_TO_REPORT[tabId] ?? "rent-roll";
  const propertyOptions = useMemo(() => {
    void propertyTick;
    return buildManagerPropertyFilterOptions(userId ?? null);
  }, [userId, propertyTick]);

  useEffect(() => {
    if (!ready) return;
    void syncPropertyPipelineFromServer({ force: true }).then(() => setPropertyTick((n) => n + 1));
  }, [ready, userId]);

  const runReport = useCallback(async () => {
    setLoading(true);
    try {
      const qs = buildQuery(reportId, filters);
      const res = await fetch(`/api/reports/${reportId}?${qs}&backfill=1`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load report.");
      setReport(data as ReportResult);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load report.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [reportId, filters, showToast]);

  useEffect(() => {
    void runReport();
  }, [runReport, tabId]);

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

  const tabs = [
    { id: "rent-roll", label: "Rent roll" },
    { id: "delinquency", label: "Delinquency" },
    { id: "income-statement", label: "P&L" },
    { id: "expenses", label: "Expenses" },
    { id: "lease-expiration", label: "Lease expiry" },
    { id: "vendors", label: "Vendor spend" },
    { id: "1099", label: "1099 forms" },
  ];

  const showDateRange = ["income-statement", "expenses", "vendors"].includes(tabId);
  const showProperty = tabId !== "1099";
  const showDaysAhead = tabId === "lease-expiration";
  const showTaxYear = tabId === "1099";
  const query = buildQuery(reportId, filters);

  return (
    <ManagerPortalPageShell
      title="Financials"
      subtitle="Portfolio reports, P&L, expenses, and 1099-NEC forms."
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((tab) => (
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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <ReportFilterBar
            showProperty={showProperty}
            showDateRange={showDateRange}
            showDaysAhead={showDaysAhead}
            showTaxYear={showTaxYear}
            propertyOptions={propertyOptions}
            filters={filters}
            onChange={(next) => setFilters((f) => ({ ...f, ...next }))}
            onRun={() => void runReport()}
            loading={loading}
          />
          <div className="flex flex-wrap gap-2">
            {tabId === "expenses" ? (
              <Button variant="outline" onClick={() => setExpenseModal(true)}>
                Add expense
              </Button>
            ) : null}
            {tabId === "1099" ? (
              <a
                href={`/api/reports/1099-nec/export?taxYear=${filters.taxYear}&all=1`}
                className="inline-flex h-9 items-center rounded-full border border-border bg-card px-4 text-xs font-medium text-foreground shadow-[var(--shadow-sm)] hover:bg-accent/40"
              >
                Download all 1099s
              </a>
            ) : null}
            {tabId !== "1099" ? <ReportExportButtons reportId={reportId} query={query} /> : null}
          </div>
        </div>

        {tabId === "1099" && report ? (
          <div className={PORTAL_SECTION_SURFACE}>
            <ReportTable report={report} loading={loading} />
            <div className="mt-3 space-y-2 px-1">
              {report.rows.map((row) => {
                const vendorId = String(row.vendorId ?? "");
                return (
                  <div
                    key={vendorId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm"
                  >
                    <span>
                      {String(row.vendorName)} — {String(row.totalPaid)} ({String(row.w9Status)})
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setTaxVendorId(vendorId);
                          setTaxVendorName(String(row.vendorName ?? ""));
                        }}
                      >
                        Edit W-9
                      </Button>
                      <a
                        href={`/api/reports/1099-nec/export?vendorId=${encodeURIComponent(vendorId)}&taxYear=${filters.taxYear}`}
                        className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-medium hover:bg-accent/40"
                      >
                        Download 1099
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-muted">
              Expenses must be tagged with a vendor to count toward 1099 totals. Complete payer tax profile under Plan
              settings if PDF download is blocked.
            </p>
          </div>
        ) : (
          <ReportTable report={report} loading={loading} />
        )}
      </div>

      <Modal open={expenseModal} onClose={() => setExpenseModal(false)} title="Add expense">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Category
            <select
              className="h-10 rounded-xl border border-border bg-card px-3 text-sm"
              value={expenseDraft.categoryCode}
              onChange={(e) => setExpenseDraft({ ...expenseDraft, categoryCode: e.target.value })}
            >
              <option value="maintenance">Maintenance</option>
              <option value="utilities">Utilities</option>
              <option value="taxes">Taxes</option>
              <option value="insurance">Insurance</option>
              <option value="management">Management</option>
              <option value="other_expense">Other</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Amount (USD)
            <Input
              value={expenseDraft.amount}
              onChange={(e) => setExpenseDraft({ ...expenseDraft, amount: e.target.value })}
            />
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
            Vendor ID (for 1099)
            <Input
              value={expenseDraft.vendorId}
              onChange={(e) => setExpenseDraft({ ...expenseDraft, vendorId: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
            Memo
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

      <VendorTaxProfileModal
        open={Boolean(taxVendorId)}
        vendorId={taxVendorId}
        vendorName={taxVendorName}
        onClose={() => setTaxVendorId(null)}
        onSaved={() => void runReport()}
      />
    </ManagerPortalPageShell>
  );
}
