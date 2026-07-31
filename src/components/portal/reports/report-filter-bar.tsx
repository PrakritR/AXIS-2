"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterCollapsibleSection, FilterFieldsAccordion, FilterSingleSelectList, filterSingleSelectSummary, useFilterAccordionClose } from "@/components/portal/filter-field-lists";
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
  stacked = false,
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
  /** Vertical stack for modal forms. */
  stacked?: boolean;
  /** Extra controls rendered at the start of the row (e.g. a document scope selector). */
  leading?: ReactNode;
  /** Extra controls rendered at the end of the row, before the run button (e.g. row-level filters). */
  trailing?: ReactNode;
}) {
  return (
    <div className={stacked ? "flex flex-col gap-4" : "flex flex-wrap items-end gap-3"}>
      {leading}

      {showDateRange ? (
        <div className={stacked ? "grid grid-cols-1 gap-4 sm:grid-cols-2" : "grid w-full min-w-0 grid-cols-2 gap-3 sm:flex sm:w-auto"}>
          <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted">
            From
            <Input
              type="date"
              className="h-10 w-full min-w-0 sm:w-[10.5rem]"
              value={filters.from}
              onChange={(e) => onChange({ from: e.target.value })}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted">
            To
            <Input
              type="date"
              className="h-10 w-full min-w-0 sm:w-[10.5rem]"
              value={filters.to}
              onChange={(e) => onChange({ to: e.target.value })}
            />
          </label>
        </div>
      ) : null}

      {showProperty && propertyOptions && propertyOptions.length > 0 ? (
        <ReportPropertyFilterDropdown
          propertyOptions={propertyOptions}
          value={filters.propertyId}
          onChange={(propertyId) => onChange({ propertyId })}
          className={stacked ? undefined : "min-w-[12rem] sm:w-auto"}
        />
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

function ReportPropertyFilterDropdown({
  propertyOptions,
  value,
  onChange,
  className,
}: {
  propertyOptions: { id: string; label: string }[];
  value: string;
  onChange: (propertyId: string) => void;
  /** Extra width constraint for the inline (toolbar) variant. */
  className?: string;
}) {
  // Wrap in an accordion so the single-select menu closes on pick
  // (useFilterAccordionClose is a no-op without a provider above it).
  const field = (
    <FilterFieldsAccordion>
      <ReportPropertyFilterField propertyOptions={propertyOptions} value={value} onChange={onChange} />
    </FilterFieldsAccordion>
  );

  return className ? <div className={className}>{field}</div> : field;
}

function ReportPropertyFilterField({
  propertyOptions,
  value,
  onChange,
}: {
  propertyOptions: { id: string; label: string }[];
  value: string;
  onChange: (propertyId: string) => void;
}) {
  const closeDropdown = useFilterAccordionClose();
  const options = [
    { value: "", label: "All properties" },
    ...propertyOptions.map((p) => ({ value: p.id, label: p.label })),
  ];

  return (
    <FilterCollapsibleSection
      sectionId="property"
      label="Property"
      summary={filterSingleSelectSummary(value, options, "All properties")}
      empty={!value}
      dataAttr="report-filter-property-trigger"
    >
      <FilterSingleSelectList
        options={options}
        value={value}
        onChange={onChange}
        onPick={closeDropdown}
        dataAttr="report-filter-property"
      />
    </FilterCollapsibleSection>
  );
}

export function ReportExportButtons({
  reportId,
  query,
  formats = ["csv", "pdf"],
}: {
  reportId: string;
  query: string;
  formats?: ("csv" | "pdf" | "quickbooks")[];
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
      {formats.includes("quickbooks") ? (
        <a
          href={`${base}&format=quickbooks`}
          className="inline-flex h-9 items-center rounded-full border border-border bg-card px-4 text-xs font-medium text-foreground shadow-[var(--shadow-sm)] hover:bg-accent/40"
          data-attr="export-quickbooks"
        >
          Export QuickBooks
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
