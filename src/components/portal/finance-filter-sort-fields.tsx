"use client";

import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import {
  FILTER_FIELD_LABEL_CLASS,
  FilterFieldsAccordion,
  FilterSingleSelectDropdown,
} from "@/components/portal/filter-field-lists";
import type { ReportFilterState } from "@/components/portal/reports/report-filter-bar";
import type { ReportResult, ReportRow } from "@/lib/reports/types";

export type FinanceRowFilterState = {
  resident: string;
  type: string;
  category: string;
  vendor: string;
};

function uniqueRowValues(rows: ReportRow[], key: string): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = String(row[key] ?? "").trim();
    if (value) seen.add(value);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function financeFilterFieldCount({
  tabId,
  hasProperty,
  hasRowFilters,
  hasSortOptions,
}: {
  tabId: string;
  hasProperty: boolean;
  hasRowFilters: boolean;
  hasSortOptions: boolean;
}): number {
  let count = 0;
  if (hasProperty) count += 1;
  if (tabId === "income" && hasRowFilters) count += 2;
  if (tabId === "expenses" && hasRowFilters) count += 2;
  if (hasSortOptions) count += 2;
  return Math.max(count, 1);
}

export function FinanceFilterSortFields({
  tabId,
  propertyOptions,
  filters,
  onFiltersChange,
  report,
  rowFilters,
  onRowFiltersChange,
  sortOptions,
  sortKey,
  onSortKeyChange,
  sortDir,
  onSortDirChange,
}: {
  tabId: string;
  propertyOptions: { id: string; label: string }[];
  filters: ReportFilterState;
  onFiltersChange: (next: Partial<ReportFilterState>) => void;
  report: ReportResult | null;
  rowFilters: FinanceRowFilterState;
  onRowFiltersChange: (next: Partial<FinanceRowFilterState>) => void;
  sortOptions: { value: string; label: string }[];
  sortKey: string;
  onSortKeyChange: (next: string) => void;
  sortDir: "asc" | "desc";
  onSortDirChange: (next: "asc" | "desc") => void;
}) {
  const rows = report?.rows ?? [];
  const residents = useMemo(() => uniqueRowValues(rows, "resident"), [rows]);
  const types = useMemo(() => uniqueRowValues(rows, "category"), [rows]);
  const categories = useMemo(() => uniqueRowValues(rows, "category"), [rows]);
  const vendors = useMemo(() => uniqueRowValues(rows, "vendor"), [rows]);
  const showRowFilters = Boolean(report && rows.length > 0);
  const propertyListOptions = [
    { value: "", label: "All properties" },
    ...propertyOptions.map((option) => ({ value: option.id, label: option.label })),
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={FILTER_FIELD_LABEL_CLASS}>From</span>
          <Input
            type="date"
            className="h-10 w-full min-w-0"
            value={filters.from}
            onChange={(event) => onFiltersChange({ from: event.target.value })}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={FILTER_FIELD_LABEL_CLASS}>To</span>
          <Input
            type="date"
            className="h-10 w-full min-w-0"
            value={filters.to}
            onChange={(event) => onFiltersChange({ to: event.target.value })}
          />
        </label>
      </div>

      <FilterFieldsAccordion>
        {propertyOptions.length > 0 ? (
          <FilterSingleSelectDropdown
            sectionId="property"
            label="Property"
            options={propertyListOptions}
            value={filters.propertyId}
            onChange={(propertyId) => onFiltersChange({ propertyId })}
            placeholder="All properties"
            dataAttr="finances-filter-property"
          />
        ) : null}

        {tabId === "income" && showRowFilters ? (
          <>
            <FilterSingleSelectDropdown
              sectionId="resident"
              label="Resident"
              options={[{ value: "", label: "All residents" }, ...residents.map((value) => ({ value, label: value }))]}
              value={rowFilters.resident}
              onChange={(resident) => onRowFiltersChange({ resident })}
              placeholder="All residents"
              dataAttr="finances-filter-resident"
            />
            <FilterSingleSelectDropdown
              sectionId="type"
              label="Type"
              options={[{ value: "", label: "All types" }, ...types.map((value) => ({ value, label: value }))]}
              value={rowFilters.type}
              onChange={(type) => onRowFiltersChange({ type })}
              placeholder="All types"
              dataAttr="finances-filter-type"
            />
          </>
        ) : null}

        {tabId === "expenses" && showRowFilters ? (
          <>
            <FilterSingleSelectDropdown
              sectionId="category"
              label="Category"
              options={[
                { value: "", label: "All categories" },
                ...categories.map((value) => ({ value, label: value })),
              ]}
              value={rowFilters.category}
              onChange={(category) => onRowFiltersChange({ category })}
              placeholder="All categories"
              dataAttr="finances-filter-category"
            />
            <FilterSingleSelectDropdown
              sectionId="vendor"
              label="Vendor"
              options={[{ value: "", label: "All vendors" }, ...vendors.map((value) => ({ value, label: value }))]}
              value={rowFilters.vendor}
              onChange={(vendor) => onRowFiltersChange({ vendor })}
              placeholder="All vendors"
              dataAttr="finances-filter-vendor"
            />
          </>
        ) : null}

        {sortOptions.length > 0 ? (
          <>
            <FilterSingleSelectDropdown
              sectionId="finance-sort-key"
              label="Sort by"
              options={sortOptions}
              value={sortKey}
              onChange={onSortKeyChange}
              placeholder="Sort by"
              dataAttr="finances-sort-key"
            />
            <FilterSingleSelectDropdown
              sectionId="finance-sort-direction"
              label="Direction"
              options={[
                { value: "asc", label: "Ascending" },
                { value: "desc", label: "Descending" },
              ]}
              value={sortDir}
              onChange={(value) => onSortDirChange(value as "asc" | "desc")}
              placeholder="Direction"
              dataAttr="finances-sort-direction"
            />
          </>
        ) : null}
      </FilterFieldsAccordion>
    </>
  );
}
