"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ManagerPortalPageShell, PORTAL_SECTION_SURFACE } from "@/components/portal/portal-metrics";
import { ReportExportButtons } from "@/components/portal/reports/report-filter-bar";
import { FinancialReportDocumentView } from "@/components/portal/reports/formal-document-preview";
import { ReportGeneratePrompt } from "@/components/portal/reports/report-generate-prompt";
import { ReportTable } from "@/components/portal/reports/report-table";
import type { ReportResult } from "@/lib/reports/types";

function defaultStatementRange() {
  const now = new Date();
  const from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

export function ResidentFinancialsPanel({
  tabId,
  basePath = "/resident",
  tabs = [
    { id: "summary", label: "Summary" },
    { id: "statements", label: "Rent statements" },
  ],
}: {
  tabId: string;
  basePath?: string;
  tabs?: ReadonlyArray<{ id: string; label: string }>;
}) {
  const [balanceReport, setBalanceReport] = useState<ReportResult | null>(null);
  const [ledgerReport, setLedgerReport] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [range, setRange] = useState(defaultStatementRange);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reports/resident-balance?backfill=1");
      const data = await res.json();
      if (res.ok) {
        setBalanceReport(data as ReportResult);
        setGenerated(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLedger = useCallback(async () => {
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
    setBalanceReport(null);
    setLedgerReport(null);
    setGenerated(false);
  }, [tabId]);

  const tabsList = tabs;

  const ledgerQuery = new URLSearchParams({ from: range.from, to: range.to }).toString();

  return (
    <ManagerPortalPageShell title="Finances" subtitle="Balance and rent statements.">
      <div className="mb-4 flex flex-wrap gap-2">
        {tabsList.map((tab) => (
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

      {tabId === "summary" ? (
        <div className={`${PORTAL_SECTION_SURFACE} space-y-4 p-4 sm:p-5`}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <button
              type="button"
              className="h-10 rounded-full bg-foreground px-4 text-xs font-medium text-background hover:opacity-90"
              onClick={() => void loadSummary()}
              disabled={loading}
            >
              {loading ? "Generating…" : "Generate summary"}
            </button>
          </div>
          {loading ? (
            <ReportGeneratePrompt title="Generating summary…" description="Calculating your current balance and charges." />
          ) : !generated ? (
            <ReportGeneratePrompt
              title="Generate balance summary"
              description="Click Generate summary to view your current rent balance and pending charges."
            />
          ) : balanceReport ? (
            <FinancialReportDocumentView report={balanceReport} />
          ) : (
            <ReportTable report={balanceReport} loading={loading} generated={generated} />
          )}
          {generated ? (
            <Link
              href={`${basePath}/payments`}
              className="inline-flex h-9 items-center rounded-full bg-foreground px-4 text-xs font-medium text-background"
            >
              Pay now
            </Link>
          ) : null}
        </div>
      ) : null}

      {tabId === "statements" ? (
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
                className="mt-5 h-10 rounded-full bg-foreground px-4 text-xs font-medium text-background hover:opacity-90"
                onClick={() => void loadLedger()}
                disabled={loading}
              >
                {loading ? "Generating…" : "Generate statement"}
              </button>
            </div>
            {generated ? <ReportExportButtons reportId="resident-ledger" query={ledgerQuery} /> : null}
          </div>
          {loading ? (
            <ReportGeneratePrompt title="Generating statement…" description="Compiling your rent ledger for the selected period." />
          ) : !generated ? (
            <ReportGeneratePrompt
              title="Generate rent statement"
              description="Select a date range and click Generate statement. Your official rent ledger appears below."
            />
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
