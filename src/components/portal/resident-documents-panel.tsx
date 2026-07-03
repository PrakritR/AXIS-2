"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ManagerPortalFilterRow, ManagerPortalPageShell, PORTAL_SECTION_SURFACE } from "@/components/portal/portal-metrics";
import { TabNav } from "@/components/ui/tabs";
import { ReportExportButtons } from "@/components/portal/reports/report-filter-bar";
import { FinancialReportDocumentView } from "@/components/portal/reports/formal-document-preview";
import { ReportGeneratePrompt } from "@/components/portal/reports/report-generate-prompt";
import { ReportTable } from "@/components/portal/reports/report-table";
import { ResidentLeasePanel } from "@/components/portal/resident-lease-panel";
import { ResidentApplicationsPanel } from "@/components/portal/resident-applications-panel";
import { ResidentDocumentPhotos } from "@/components/portal/resident-document-photos";
import type { ReportResult } from "@/lib/reports/types";

function defaultReceiptRange() {
  const now = new Date();
  const from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

export function ResidentDocumentsPanel({
  tabId,
  basePath = "/resident",
  tabs,
}: {
  tabId: string;
  basePath?: string;
  tabs: ReadonlyArray<{ id: string; label: string }>;
}) {
  const [ledgerReport, setLedgerReport] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [range, setRange] = useState(defaultReceiptRange);

  const loadReceipts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to, backfill: "1" });
      const res = await fetch(`/api/reports/resident-ledger?${params}`);
      const data = await res.json();
      if (res.ok) {
        setLedgerReport(data as ReportResult);
        setGenerated(true);
      }
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    queueMicrotask(() => {
      setLedgerReport(null);
      setGenerated(false);
    });
  }, [tabId]);

  const ledgerQuery = new URLSearchParams({ from: range.from, to: range.to }).toString();

  const tabItems = useMemo(
    () => tabs.map((tab) => ({ id: tab.id, label: tab.label, href: `${basePath}/documents/${tab.id}` })),
    [tabs, basePath],
  );

  return (
    <ManagerPortalPageShell
      title="Documents"
      subtitle="Your active lease and official rent receipt documents."
      filterRow={
        <ManagerPortalFilterRow>
          <TabNav items={tabItems} activeId={tabId} />
        </ManagerPortalFilterRow>
      }
    >
      {tabId === "lease" ? (
        <div className="space-y-4">
          <ResidentLeasePanel embedded />
          <ResidentDocumentPhotos />
        </div>
      ) : null}

      {tabId === "application" ? <ResidentApplicationsPanel embedded /> : null}

      {tabId === "receipts" ? (
        <div className={`${PORTAL_SECTION_SURFACE} space-y-4 p-4 sm:p-5`}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                From
                <input
                  type="date"
                  className="h-10 rounded-xl border border-border bg-card px-3 text-sm"
                  value={range.from}
                  onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                To
                <input
                  type="date"
                  className="h-10 rounded-xl border border-border bg-card px-3 text-sm"
                  value={range.to}
                  onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                />
              </label>
              <button
                type="button"
                className="mt-5 h-10 rounded-full border border-border bg-foreground px-4 text-xs font-medium text-background hover:opacity-90"
                onClick={() => void loadReceipts()}
                disabled={loading}
              >
                {loading ? "Generating…" : "Generate receipts"}
              </button>
            </div>
            {generated ? <ReportExportButtons reportId="resident-ledger" query={ledgerQuery} /> : null}
          </div>
          {loading ? (
            <ReportGeneratePrompt loading loadingTitle="Generating receipts…" />
          ) : !generated ? (
            <ReportGeneratePrompt title="No rent receipts yet." />
          ) : ledgerReport ? (
            <FinancialReportDocumentView report={ledgerReport} />
          ) : (
            <ReportTable report={ledgerReport} loading={loading} generated={generated} />
          )}
        </div>
      ) : null}
    </ManagerPortalPageShell>
  );
}
