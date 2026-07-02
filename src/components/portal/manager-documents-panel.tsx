"use client";

import { Fragment } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { TabNav } from "@/components/ui/tabs";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  ManagerPortalFilterRow,
  ManagerPortalPageShell,
  MANAGER_TABLE_TH,
  PORTAL_FILTER_ACTIONS_MOBILE,
  PORTAL_HEADER_ACTION_BTN,
  PORTAL_KPI_LABEL,
  PORTAL_KPI_VALUE,
  PORTAL_PAGE_ACTIONS_DESKTOP,
} from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_TD,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_DETAIL_BTN,
  PORTAL_DETAIL_BTN_PRIMARY,
  PortalTableDetailActions,
  PortalDataTableEmpty,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";
import {
  ReportExportButtons,
  ReportFilterBar,
  type ReportFilterState,
} from "@/components/portal/reports/report-filter-bar";
import {
  FormalDocumentScopeBar,
  buildFormalDocumentQuery,
  buildScopedReportQuery,
  type FormalDocumentFilterState,
} from "@/components/portal/reports/formal-document-scope-bar";
import { ReportTable } from "@/components/portal/reports/report-table";
import { FormalDocumentsPreview, FinancialReportDocumentView, OccupancyDocumentView } from "@/components/portal/reports/formal-document-preview";
import { ReportGeneratePrompt } from "@/components/portal/reports/report-generate-prompt";
import { VendorTaxProfileModal } from "@/components/portal/vendor-tax-profile-modal";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { buildManagerPropertyFilterOptions } from "@/lib/manager-portfolio-access";
import { syncPropertyPipelineFromServer } from "@/lib/demo-property-pipeline";
import type { OccupancyReport, PropertyRentReceiptDocument } from "@/lib/reports/formal-documents/spec";
import type { ReportResult } from "@/lib/reports/types";

export const DOCUMENT_TABS = [
  { id: "income-documents", label: "Income documents" },
  { id: "expense-documents", label: "Expense documents" },
  { id: "occupancy", label: "Occupancy" },
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

function defaultDocumentScopeFilters(): FormalDocumentFilterState {
  return {
    scope: "portfolio",
    propertyId: "",
    residentEmail: "",
    roomLabel: "",
  };
}

function w9StatusTone(status: string) {
  const s = status.toLowerCase();
  if (s.includes("complete")) return "portal-badge-success ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
  if (s.includes("missing")) return "portal-badge-danger ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
  if (s.includes("pending")) return "portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
  return "bg-accent/30 text-foreground ring-1 ring-border";
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
  const [scopeFilters, setScopeFilters] = useState(defaultDocumentScopeFilters);
  const [report, setReport] = useState<ReportResult | null>(null);
  const [propertyDocuments, setPropertyDocuments] = useState<PropertyRentReceiptDocument[] | null>(null);
  const [occupancyReport, setOccupancyReport] = useState<OccupancyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [taxVendorId, setTaxVendorId] = useState<string | null>(null);
  const [taxVendorName, setTaxVendorName] = useState("");
  const [expanded1099Id, setExpanded1099Id] = useState<string | null>(null);

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
        const qs = buildScopedReportQuery(
          { from: filters.from, to: filters.to },
          scopeFilters,
          { backfill: "1" },
        );
        const res = await fetch(`/api/reports/expenses?${qs}`);
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
      } else if (tabId === "occupancy") {
        const params = new URLSearchParams({ from: filters.from, to: filters.to });
        if (filters.propertyId) params.set("propertyId", filters.propertyId);
        const res = await fetch(`/api/reports/occupancy?${params}`, { credentials: "include" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load occupancy report.");
        setPropertyDocuments(null);
        setReport(null);
        setOccupancyReport(data as OccupancyReport);
      } else {
        setPropertyDocuments(null);
        setReport(null);
        setOccupancyReport(null);
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
    queueMicrotask(() => {
      setReport(null);
      setPropertyDocuments(null);
      setOccupancyReport(null);
      setGenerated(false);
    });
  }, [tabId]);

  const incomeReceiptExportHref =
    tabId === "income-documents"
      ? `/api/reports/formal-documents/export?${buildFormalDocumentQuery("property_rent_receipt", { from: filters.from, to: filters.to }, scopeFilters)}`
      : null;

  const expenseExportQuery =
    tabId === "expense-documents"
      ? buildScopedReportQuery({ from: filters.from, to: filters.to }, scopeFilters)
      : "";

  const showDateRange = tabId !== "1099";
  const showProperty = tabId === "tax-summary" || tabId === "occupancy";
  const showTaxYear = tabId === "1099";

  const documentTabItems = useMemo(
    () => DOCUMENT_TABS.map((tab) => ({ ...tab, href: `${basePath}/documents/${tab.id}` })),
    [basePath],
  );

  const exportActions = (
    <>
      {tabId === "1099" ? (
        <a
          href={`/api/reports/1099-nec/export?taxYear=${filters.taxYear}&all=1`}
          className="inline-flex h-10 items-center rounded-full border border-border bg-card px-4 text-xs font-medium text-foreground shadow-[var(--shadow-sm)] hover:bg-accent/40"
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
          className="inline-flex h-10 items-center rounded-full border border-border bg-card px-4 text-xs font-medium text-foreground shadow-[var(--shadow-sm)] hover:bg-accent/40"
        >
          Download PDF
        </a>
      ) : null}
    </>
  );

  const hasExportActions =
    tabId === "1099" ||
    (tabId === "expense-documents" && generated) ||
    Boolean(incomeReceiptExportHref && generated);

  return (
    <ManagerPortalPageShell
      title="Documents"
      titleAside={
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {hasExportActions ? (
            <div className={`${PORTAL_PAGE_ACTIONS_DESKTOP} flex-wrap gap-2`}>{exportActions}</div>
          ) : null}
          <Button
            type="button"
            variant="primary"
            className={PORTAL_HEADER_ACTION_BTN}
            onClick={() => void runReport()}
            disabled={loading}
            data-attr="documents-generate-report"
          >
            {loading ? "Generating…" : "Generate report"}
          </Button>
        </div>
      }
      filterRow={
        <ManagerPortalFilterRow>
          <TabNav activeId={tabId} items={documentTabItems} />
          {hasExportActions ? <div className={`${PORTAL_FILTER_ACTIONS_MOBILE} gap-2`}>{exportActions}</div> : null}
        </ManagerPortalFilterRow>
      }
    >
      <div className="space-y-4">
        <ReportFilterBar
          showProperty={showProperty}
          showDateRange={showDateRange}
          showDaysAhead={false}
          showTaxYear={showTaxYear}
          showRunButton={false}
          propertyOptions={propertyOptions}
          filters={filters}
          onChange={(next) => setFilters((f) => ({ ...f, ...next }))}
          onRun={() => void runReport()}
          loading={loading}
          leading={
            tabId === "income-documents" || tabId === "expense-documents" ? (
              <FormalDocumentScopeBar
                inline
                filters={scopeFilters}
                onChange={(next) => setScopeFilters((f) => ({ ...f, ...next }))}
              />
            ) : null
          }
        />

        {tabId === "tax-summary" && generated ? <TaxSummaryCards report={report} /> : null}

        {tabId === "income-documents" ? (
          <div>
            {loading ? (
              <ReportGeneratePrompt loading loadingTitle="Generating documents…" />
            ) : !generated ? (
              <ReportGeneratePrompt title="No rent receipt documents yet." />
            ) : propertyDocuments && propertyDocuments.length > 0 ? (
              <FormalDocumentsPreview propertyDocuments={propertyDocuments} />
            ) : (
              <ReportTable report={report} loading={loading} generated={generated} />
            )}
          </div>
        ) : tabId === "1099" && report ? (
          <div>
            {report.rows.length === 0 ? (
              <PortalDataTableEmpty message="No 1099 candidates yet." icon="document" />
            ) : (
              <div className={PORTAL_DATA_TABLE_WRAP}>
                <div className={PORTAL_DATA_TABLE_SCROLL}>
                  <table className="min-w-[640px] w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className={PORTAL_TABLE_HEAD_ROW}>
                        <th className={`${MANAGER_TABLE_TH} text-left`}>Vendor</th>
                        <th className={`${MANAGER_TABLE_TH} text-left`}>Total paid</th>
                        <th className={`${MANAGER_TABLE_TH} text-left`}>W-9 status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.rows.map((row) => {
                        const vendorId = String(row.vendorId ?? "");
                        const w9Status = String(row.w9Status ?? "");
                        return (
                          <Fragment key={vendorId}>
                            <tr
                              className={PORTAL_TABLE_TR_EXPANDABLE}
                              onClick={createPortalRowExpandClick(() =>
                                setExpanded1099Id((cur) => (cur === vendorId ? null : vendorId)),
                              )}
                              aria-expanded={expanded1099Id === vendorId}
                            >
                              <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>{String(row.vendorName)}</td>
                              <td className={`${PORTAL_TABLE_TD} tabular-nums`}>{String(row.totalPaid)}</td>
                              <td className={PORTAL_TABLE_TD}>
                                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${w9StatusTone(w9Status)}`}>
                                  {w9Status || "Unknown"}
                                </span>
                              </td>
                            </tr>
                            {expanded1099Id === vendorId ? (
                              <tr className={PORTAL_TABLE_DETAIL_ROW}>
                                <td colSpan={3} className={PORTAL_TABLE_DETAIL_CELL}>
                                  <PortalTableDetailActions>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className={PORTAL_DETAIL_BTN_PRIMARY}
                                      onClick={() => {
                                        setTaxVendorId(vendorId);
                                        setTaxVendorName(String(row.vendorName ?? ""));
                                      }}
                                    >
                                      Edit W-9
                                    </Button>
                                    <a
                                      href={`/api/reports/1099-nec/export?vendorId=${encodeURIComponent(vendorId)}&taxYear=${filters.taxYear}`}
                                      className={`inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-medium hover:bg-accent/40 ${PORTAL_DETAIL_BTN}`}
                                    >
                                      Download 1099
                                    </a>
                                  </PortalTableDetailActions>
                                  <p className="mt-3 text-xs text-muted">
                                    Tag expenses with a vendor to include them in 1099 totals. Complete your payer tax
                                    profile under Plan if PDF download is blocked.
                                  </p>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : tabId === "occupancy" && generated && occupancyReport ? (
          <div className="rounded-2xl border border-border bg-[#eef2f7] p-4 sm:p-6">
            <OccupancyDocumentView report={occupancyReport} />
          </div>
        ) : tabId === "occupancy" && generated && !occupancyReport ? (
          <ReportGeneratePrompt title="No occupancy data yet." />
        ) : tabId === "expense-documents" && generated && report ? (
          <FinancialReportDocumentView report={report} />
        ) : tabId === "expense-documents" && !generated ? (
          <ReportGeneratePrompt title="No expense documents yet." />
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
