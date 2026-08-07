"use client";

import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import {
  FILTER_FIELD_LABEL_CLASS,
  FilterCollapsibleSection,
  FilterFieldsAccordion,
  FilterSingleSelectList,
  filterSingleSelectSummary,
} from "@/components/portal/filter-field-lists";
import { usePortalFilterDraft } from "@/lib/portal-filter-draft";
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
  defaultFilters,
  defaultRowFilters,
  defaultSortKey,
  defaultSortDir,
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
  defaultFilters: ReportFilterState;
  defaultRowFilters: FinanceRowFilterState;
  defaultSortKey: string;
  defaultSortDir: "asc" | "desc";
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

  const [draftFilters, setDraftFilters] = usePortalFilterDraft(
    filters,
    (next) => onFiltersChange(next),
    defaultFilters,
  );
  const [draftRowFilters, setDraftRowFilters] = usePortalFilterDraft(
    rowFilters,
    (next) => onRowFiltersChange(next),
    defaultRowFilters,
  );
  const [draftSortKey, setDraftSortKey] = usePortalFilterDraft(sortKey, onSortKeyChange, defaultSortKey);
  const [draftSortDir, setDraftSortDir] = usePortalFilterDraft(sortDir, onSortDirChange, defaultSortDir);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={FILTER_FIELD_LABEL_CLASS}>From</span>
          <Input
            type="date"
            className="h-10 w-full min-w-0"
            value={draftFilters.from}
            onChange={(event) => setDraftFilters({ ...draftFilters, from: event.target.value })}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={FILTER_FIELD_LABEL_CLASS}>To</span>
          <Input
            type="date"
            className="h-10 w-full min-w-0"
            value={draftFilters.to}
            onChange={(event) => setDraftFilters({ ...draftFilters, to: event.target.value })}
          />
        </label>
      </div>

      <FilterFieldsAccordion>
        {propertyOptions.length > 0 ? (
          <FilterCollapsibleSection
            sectionId="property"
            label="Property"
            summary={filterSingleSelectSummary(draftFilters.propertyId, propertyListOptions, "All properties")}
            empty={!draftFilters.propertyId}
            menuOptionCount={propertyListOptions.length}
            dataAttr="finances-filter-property-trigger"
          >
            <FilterSingleSelectList
              options={propertyListOptions}
              value={draftFilters.propertyId}
              onChange={(propertyId) => setDraftFilters({ ...draftFilters, propertyId })}
              dataAttr="finances-filter-property"
            />
          </FilterCollapsibleSection>
        ) : null}

        {tabId === "income" && showRowFilters ? (
          <>
            <FilterCollapsibleSection
              sectionId="resident"
              label="Resident"
              summary={filterSingleSelectSummary(
                draftRowFilters.resident,
                [{ value: "", label: "All residents" }, ...residents.map((value) => ({ value, label: value }))],
                "All residents",
              )}
              empty={!draftRowFilters.resident}
              menuOptionCount={residents.length + 1}
              dataAttr="finances-filter-resident-trigger"
            >
              <FilterSingleSelectList
                options={[{ value: "", label: "All residents" }, ...residents.map((value) => ({ value, label: value }))]}
                value={draftRowFilters.resident}
                onChange={(resident) => setDraftRowFilters({ ...draftRowFilters, resident })}
                dataAttr="finances-filter-resident"
              />
            </FilterCollapsibleSection>
            <FilterCollapsibleSection
              sectionId="type"
              label="Type"
              summary={filterSingleSelectSummary(
                draftRowFilters.type,
                [{ value: "", label: "All types" }, ...types.map((value) => ({ value, label: value }))],
                "All types",
              )}
              empty={!draftRowFilters.type}
              menuOptionCount={types.length + 1}
              dataAttr="finances-filter-type-trigger"
            >
              <FilterSingleSelectList
                options={[{ value: "", label: "All types" }, ...types.map((value) => ({ value, label: value }))]}
                value={draftRowFilters.type}
                onChange={(type) => setDraftRowFilters({ ...draftRowFilters, type })}
                dataAttr="finances-filter-type"
              />
            </FilterCollapsibleSection>
          </>
        ) : null}

        {tabId === "expenses" && showRowFilters ? (
          <>
            <FilterCollapsibleSection
              sectionId="category"
              label="Category"
              summary={filterSingleSelectSummary(
                draftRowFilters.category,
                [{ value: "", label: "All categories" }, ...categories.map((value) => ({ value, label: value }))],
                "All categories",
              )}
              empty={!draftRowFilters.category}
              menuOptionCount={categories.length + 1}
              dataAttr="finances-filter-category-trigger"
            >
              <FilterSingleSelectList
                options={[
                  { value: "", label: "All categories" },
                  ...categories.map((value) => ({ value, label: value })),
                ]}
                value={draftRowFilters.category}
                onChange={(category) => setDraftRowFilters({ ...draftRowFilters, category })}
                dataAttr="finances-filter-category"
              />
            </FilterCollapsibleSection>
            <FilterCollapsibleSection
              sectionId="vendor"
              label="Vendor"
              summary={filterSingleSelectSummary(
                draftRowFilters.vendor,
                [{ value: "", label: "All vendors" }, ...vendors.map((value) => ({ value, label: value }))],
                "All vendors",
              )}
              empty={!draftRowFilters.vendor}
              menuOptionCount={vendors.length + 1}
              dataAttr="finances-filter-vendor-trigger"
            >
              <FilterSingleSelectList
                options={[{ value: "", label: "All vendors" }, ...vendors.map((value) => ({ value, label: value }))]}
                value={draftRowFilters.vendor}
                onChange={(vendor) => setDraftRowFilters({ ...draftRowFilters, vendor })}
                dataAttr="finances-filter-vendor"
              />
            </FilterCollapsibleSection>
          </>
        ) : null}

        {sortOptions.length > 0 ? (
          <>
            <FilterCollapsibleSection
              sectionId="finance-sort-key"
              label="Sort by"
              summary={filterSingleSelectSummary(draftSortKey, sortOptions, "Sort by")}
              empty={draftSortKey === defaultSortKey}
              menuOptionCount={sortOptions.length}
              dataAttr="finances-sort-key-trigger"
            >
              <FilterSingleSelectList
                options={sortOptions}
                value={draftSortKey}
                onChange={setDraftSortKey}
                dataAttr="finances-sort-key"
              />
            </FilterCollapsibleSection>
            <FilterCollapsibleSection
              sectionId="finance-sort-direction"
              label="Direction"
              summary={filterSingleSelectSummary(
                draftSortDir,
                [
                  { value: "asc", label: "Ascending" },
                  { value: "desc", label: "Descending" },
                ],
                "Direction",
              )}
              empty={draftSortDir === defaultSortDir}
              menuOptionCount={2}
              dataAttr="finances-sort-direction-trigger"
            >
              <FilterSingleSelectList
                options={[
                  { value: "asc", label: "Ascending" },
                  { value: "desc", label: "Descending" },
                ]}
                value={draftSortDir}
                onChange={(value) => setDraftSortDir(value as "asc" | "desc")}
                dataAttr="finances-sort-direction"
              />
            </FilterCollapsibleSection>
          </>
        ) : null}
      </FilterFieldsAccordion>
    </>
  );
}
