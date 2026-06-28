"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ManagerPortalPageShell, PORTAL_KPI_LABEL, PORTAL_KPI_VALUE, PORTAL_SECTION_SURFACE } from "@/components/portal/portal-metrics";
import {
  ReportExportButtons,
  ReportFilterBar,
  type ReportFilterState,
} from "@/components/portal/reports/report-filter-bar";
import {
  FormalDocumentScopeBar,
  buildFormalDocumentQuery,
  type FormalDocumentFilterState,
} from "@/components/portal/reports/formal-document-scope-bar";
import { PROPERTY_RENT_RECEIPT_DEFAULT_FIELDS } from "@/lib/reports/formal-documents/spec";
import { ReportTable } from "@/components/portal/reports/report-table";
import { FormalDocumentsPreview, FinancialReportDocumentView } from "@/components/portal/reports/formal-document-preview";
import { ReportGeneratePrompt } from "@/components/portal/reports/report-generate-prompt";
import { VendorTaxProfileModal } from "@/components/portal/vendor-tax-profile-modal";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { buildManagerPropertyFilterOptions } from "@/lib/manager-portfolio-access";
import { syncPropertyPipelineFromServer } from "@/lib/demo-property-pipeline";
import type { PropertyRentReceiptDocument } from "@/lib/reports/formal-documents/spec";
import type { ReportResult } from "@/lib/reports/types";

export const DOCUMENT_TABS = [
  { id: "expense-documents", label: "Expense documents" },
  { id: "income-documents", label: "Income documents" },
  { id: "1099", label: "1099 forms" },
  { id: "tax-summary", label: "Tax summary" },
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

function defaultIncomeScopeFilters(): FormalDocumentFilterState {
  return {
    scope: "portfolio",
    propertyId: "",
    residentEmail: "",
    roomLabel: "",
    includeFields: [...PROPERTY_RENT_RECEIPT_DEFAULT_FIELDS],
  };
}

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
  const [scopeFilters, setScopeFilters] = useState(defaultIncomeScopeFilters);
  const [report, setReport] = useState<ReportResult | null>(null);
  const [propertyDocuments, setPropertyDocuments] = useState<PropertyRentReceiptDocument[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [taxVendorId, setTaxVendorId] = useState<string | null>(null);
  const [taxVendorName, setTaxVendorName] = useState("");

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
      if (tabId === "expense-documents") {
        const params = new URLSearchParams({ from: filters.from, to: filters.to, backfill: "1" });
        if (filters.propertyId) params.set("propertyId", filters.propertyId);
        const res = await fetch(`/api/reports/expenses?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load expense documents.");
        setPropertyDocuments(null);
        setReport(data as ReportResult);
      } else if (tabId === "income-documents") {
        const qs = buildFormalDocumentQuery(
          "property_rent_receipt",
          { from: filters.from, to: filters.to },
          scopeFilters,
        );
        const res = await fetch(`/api/reports/formal-documents/preview?${qs}`, { credentials: "include" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load rent receipts.");
        setPropertyDocuments((data.documents as PropertyRentReceiptDocument[]) ?? []);
        setReport(data.preview as ReportResult);
      } else if (tabId === "1099") {
        const params = new URLSearchParams({ taxYear: filters.taxYear });
        const res = await fetch(`/api/reports/1099-candidates?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load report.");
        setPropertyDocuments(null);
        setReport(data as ReportResult);
      } else if (tabId === "tax-summary") {
        const params = new URLSearchParams({ from: filters.from, to: filters.to, backfill: "1" });
        if (filters.propertyId) params.set("propertyId", filters.propertyId);
        const res = await fetch(`/api/reports/tax-summary?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load report.");
        setPropertyDocuments(null);
        setReport(data as ReportResult);
      } else {
        setPropertyDocuments(null);
        setReport(null);
      }
      setGenerated(true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load report.");
      setPropertyDocuments(null);
      setReport(null);
      setGenerated(false);
    } finally {
      setLoading(false);
    }
  }, [tabId, filters, scopeFilters, showToast]);

  useEffect(() => {
    setReport(null);
    setPropertyDocuments(null);
    setGenerated(false);
  }, [tabId]);

  const incomeReceiptExportHref =
    tabId === "income-documents"
      ? `/api/reports/formal-documents/export?${buildFormalDocumentQuery("property_rent_receipt", { from: filters.from, to: filters.to }, scopeFilters)}`
      : null;

  const expenseExportQuery = (() => {
    const params = new URLSearchParams({ from: filters.from, to: filters.to });
    if (filters.propertyId) params.set("propertyId", filters.propertyId);
    return params.toString();
  })();

  const showDateRange = tabId !== "1099";
  const showProperty = tabId === "tax-summary" || tabId === "expense-documents";
  const showTaxYear = tabId === "1099";

  return (
    <ManagerPortalPageShell title="Documents">
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
        {tabId === "expense-documents" ? (
          <p className="text-sm text-muted">
            House spending records for utilities, Wi‑Fi, heating, cleaning, electricity, insurance, and other property
            costs — use for tax and audit documentation.
          </p>
        ) : null}

        {tabId === "income-documents" ? (
          <>
            <p className="text-sm text-muted">
              Rent received and days rented by property — one receipt per property that combines occupancy and
              payments for the selected period.
            </p>
            <FormalDocumentScopeBar
              kind="property_rent_receipt"
              filters={scopeFilters}
              onChange={(next) => setScopeFilters((f) => ({ ...f, ...next }))}
            />
          </>
        ) : null}

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
            {tabId === "1099" ? (
              <a
                href={`/api/reports/1099-nec/export?taxYear=${filters.taxYear}&all=1`}
                className="inline-flex h-9 items-center rounded-full border border-border bg-card px-4 text-xs font-medium text-foreground shadow-[var(--shadow-sm)] hover:bg-accent/40"
              >
                Download all 1099s
              </a>
            ) : null}
            {tabId === "expense-documents" && generated ? (
              <ReportExportButtons reportId="expenses" query={expenseExportQuery} />
            ) : null}
            {incomeReceiptExportHref && generated ? (
              <a
                href={incomeReceiptExportHref}
                className="inline-flex h-9 items-center rounded-full border border-border bg-card px-4 text-xs font-medium text-foreground shadow-[var(--shadow-sm)] hover:bg-accent/40"
              >
                Download PDF
              </a>
            ) : null}
          </div>
        </div>

        {tabId === "tax-summary" && generated ? <TaxSummaryCards report={report} /> : null}

        {tabId === "income-documents" ? (
          <div>
            {loading ? (
              <ReportGeneratePrompt title="Generating documents…" description="Building rent receipt statements for the selected period." />
            ) : !generated ? (
              <ReportGeneratePrompt
                title="Generate rent receipt documents"
                description="Set your date range and scope, then click Generate report. Formal receipts appear here for review and PDF export."
              />
            ) : propertyDocuments && propertyDocuments.length > 0 ? (
              <FormalDocumentsPreview propertyDocuments={propertyDocuments} />
            ) : (
              <ReportTable report={report} loading={loading} generated={generated} />
            )}
          </div>
        ) : tabId === "1099" && report ? (
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
        ) : tabId === "expense-documents" && generated && report ? (
          <FinancialReportDocumentView report={report} />
        ) : tabId === "tax-summary" && generated && report ? (
          <FinancialReportDocumentView report={report} />
        ) : (
          <ReportTable report={report} loading={loading} generated={generated} />
        )}
      </div>

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
