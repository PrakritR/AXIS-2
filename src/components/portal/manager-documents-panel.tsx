"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ManagerPortalPageShell, PORTAL_KPI_LABEL, PORTAL_KPI_VALUE, PORTAL_SECTION_SURFACE } from "@/components/portal/portal-metrics";
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
  summary: "tax-summary",
  "rent-receipts": "rent-receipts",
  expenses: "expenses",
  "rental-days": "rental-days",
  "profit-loss": "income-statement",
  "1099": "1099-candidates",
};

const DOCUMENT_TABS = [
  { id: "summary", label: "Tax summary" },
  { id: "rent-receipts", label: "Rent receipts" },
  { id: "expenses", label: "Repairs & expenses" },
  { id: "rental-days", label: "Days rented" },
  { id: "profit-loss", label: "Income & expenses" },
  { id: "1099", label: "1099 forms" },
] as const;

function defaultFilters(): ReportFilterState {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const defaultTaxYear = now.getMonth() <= 2 ? now.getFullYear() - 1 : now.getFullYear() - 1;
  return {
    propertyId: "",
    from: yearStart.toISOString().slice(0, 10),
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

function TaxSummaryCards({ report }: { report: ReportResult | null }) {
  if (!report?.meta) return null;
  const cards = [
    { label: "Rent earned", value: String(report.meta.totalEarned ?? "—") },
    { label: "Repairs & expenses", value: String(report.meta.totalSpent ?? "—") },
    { label: "Days rented", value: String(report.meta.totalDaysRented ?? "—") },
    { label: "Net income", value: String(report.meta.netIncome ?? "—") },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-2xl border border-border bg-card px-4 py-3">
          <p className={PORTAL_KPI_VALUE}>{card.value}</p>
          <p className={PORTAL_KPI_LABEL}>{card.label}</p>
        </div>
      ))}
    </div>
  );
}

export function ManagerDocumentsPanel({
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

  const reportId = TAB_TO_REPORT[tabId] ?? "tax-summary";
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
    void Promise.resolve().then(() => void runReport());
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

  const showDateRange = ["summary", "rent-receipts", "expenses", "rental-days", "profit-loss"].includes(tabId);
  const showProperty = tabId !== "1099";
  const showTaxYear = tabId === "1099";
  const query = buildQuery(reportId, filters);

  return (
    <ManagerPortalPageShell
      title="Documents"
      subtitle="Tax records for your properties — rent receipts, repairs, days rented, and what you earned."
    >
      <p className="mb-4 rounded-2xl border border-border bg-accent/20 px-4 py-3 text-sm leading-6 text-muted">
        Keep everything your accountant needs in one place: rent payments received, home repairs and operating costs,
        how many days each unit was rented, and annual totals for Schedule E or other rental tax filings. Export any
        tab to CSV or PDF for your records.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {DOCUMENT_TABS.map((tab) => (
          <Link
            key={tab.id}
            href={`${basePath}/documents/${tab.id}`}
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
            showDaysAhead={false}
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
                Add repair / expense
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

        {tabId === "summary" ? <TaxSummaryCards report={report} /> : null}

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
              Tag expenses with a vendor to include them in 1099 totals. Complete your payer tax profile under Plan if
              PDF download is blocked.
            </p>
          </div>
        ) : (
          <>
            {tabId === "rent-receipts" ? (
              <p className="text-xs text-muted">
                Paid rent and related income recorded in your ledger. Use exports as rent receipts for tax filing.
              </p>
            ) : null}
            {tabId === "expenses" ? (
              <p className="text-xs text-muted">
                Log home repairs, maintenance, utilities, insurance, taxes, and other costs you paid on the property.
              </p>
            ) : null}
            {tabId === "rental-days" ? (
              <p className="text-xs text-muted">
                Occupied unit-days in the selected period — useful for personal-use vs rental-use calculations on Schedule E.
              </p>
            ) : null}
            {tabId === "profit-loss" ? (
              <p className="text-xs text-muted">
                Full income and expense breakdown by category for the selected date range.
              </p>
            ) : null}
            <ReportTable report={report} loading={loading} />
          </>
        )}
      </div>

      <Modal open={expenseModal} onClose={() => setExpenseModal(false)} title="Add repair or expense">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Category
            <select
              className="h-10 rounded-xl border border-border bg-card px-3 text-sm"
              value={expenseDraft.categoryCode}
              onChange={(e) => setExpenseDraft({ ...expenseDraft, categoryCode: e.target.value })}
            >
              <option value="maintenance">Home repair / maintenance</option>
              <option value="utilities">Utilities</option>
              <option value="taxes">Property taxes</option>
              <option value="insurance">Insurance</option>
              <option value="management">Management fees</option>
              <option value="other_expense">Other expense</option>
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

/** @deprecated Use ManagerDocumentsPanel */
export const ManagerFinancialsPanel = ManagerDocumentsPanel;
