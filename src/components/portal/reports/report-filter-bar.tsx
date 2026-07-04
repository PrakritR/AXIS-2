"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PORTAL_TOOLBAR_GROUP } from "@/components/portal/portal-metrics";

export type ReportFilterState = {
  propertyId: string;
  from: string;
  to: string;
  daysAhead: string;
  taxYear: string;
};

export function ReportFilterBar({
  showProperty,
  showDateRange,
  showDaysAhead,
  showTaxYear,
  propertyOptions,
  filters,
  onChange,
  onRun,
  loading,
  runLabel = "Generate report",
  showRunButton = true,
  leading,
  trailing,
}: {
  showProperty?: boolean;
  showDateRange?: boolean;
  showDaysAhead?: boolean;
  showTaxYear?: boolean;
  propertyOptions?: { id: string; label: string }[];
  filters: ReportFilterState;
  onChange: (next: Partial<ReportFilterState>) => void;
  onRun: () => void;
  loading?: boolean;
  runLabel?: string;
  showRunButton?: boolean;
  /** Extra controls rendered at the start of the row (e.g. a document scope selector). */
  leading?: ReactNode;
  /** Extra controls rendered at the end of the row, before the run button (e.g. row-level filters). */
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      {leading}
      {showProperty && propertyOptions && propertyOptions.length > 0 ? (
        <label className="flex min-w-[10rem] flex-col gap-1.5 text-xs font-medium text-muted">
          Property
          <select
            className="h-10 rounded-full border border-border bg-card px-3.5 text-sm text-foreground shadow-[var(--shadow-sm)]"
            value={filters.propertyId}
            onChange={(e) => onChange({ propertyId: e.target.value })}
          >
            <option value="">All properties</option>
            {propertyOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {showDateRange ? (
        <>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
            From
            <Input
              type="date"
              className="h-10 w-[10.5rem]"
              value={filters.from}
              onChange={(e) => onChange({ from: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
            To
            <Input
              type="date"
              className="h-10 w-[10.5rem]"
              value={filters.to}
              onChange={(e) => onChange({ to: e.target.value })}
            />
          </label>
        </>
      ) : null}

      {showDaysAhead ? (
        <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
          Days ahead
          <Input
            type="number"
            min={1}
            className="h-10 w-[8rem]"
            value={filters.daysAhead}
            onChange={(e) => onChange({ daysAhead: e.target.value })}
          />
        </label>
      ) : null}

      {showTaxYear ? (
        <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
          Tax year
          <Input
            type="number"
            className="h-10 w-[8rem]"
            value={filters.taxYear}
            onChange={(e) => onChange({ taxYear: e.target.value })}
          />
        </label>
      ) : null}

      {trailing}

      {showRunButton ? (
        <div className={PORTAL_TOOLBAR_GROUP}>
          <Button variant="primary" onClick={onRun} disabled={loading}>
            {loading ? "Loading…" : runLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function ReportExportButtons({
  reportId,
  query,
  formats = ["csv", "pdf"],
}: {
  reportId: string;
  query: string;
  formats?: ("csv" | "pdf")[];
}) {
  const base = `/api/reports/${reportId}/export?${query}`;
  return (
    <div className="flex flex-wrap gap-2">
      {formats.includes("csv") ? (
        <a
          href={`${base}&format=csv`}
          className="inline-flex h-9 items-center rounded-full border border-border bg-card px-4 text-xs font-medium text-foreground shadow-[var(--shadow-sm)] hover:bg-accent/40"
        >
          Export CSV
        </a>
      ) : null}
      {formats.includes("pdf") ? (
        <a
          href={`${base}&format=pdf`}
          className="inline-flex h-9 items-center rounded-full border border-border bg-card px-4 text-xs font-medium text-foreground shadow-[var(--shadow-sm)] hover:bg-accent/40"
        >
          Export PDF
        </a>
      ) : null}
    </div>
  );
}
