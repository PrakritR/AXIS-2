"use client";

import { FilterCheckboxList, FilterSingleSelectList } from "@/components/portal/filter-field-lists";

const FIELD_LABEL_CLASS = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted";

export function ApplicationFilterSortFields({
  propertyOptions,
  propertyFilters,
  onPropertyFiltersChange,
  allLabel = "All properties",
  dataAttr = "applications-filter-property",
  selectionMode = "multi",
}: {
  propertyOptions: { id: string; label: string }[];
  propertyFilters: string[];
  onPropertyFiltersChange: (next: string[]) => void;
  allLabel?: string;
  dataAttr?: string;
  selectionMode?: "single" | "multi";
}) {
  const options = propertyOptions.map((option) => ({ value: option.id, label: option.label }));

  return (
    <div>
      <p className={FIELD_LABEL_CLASS}>Property</p>
      {selectionMode === "single" ? (
        <FilterSingleSelectList
          options={[{ value: "", label: allLabel }, ...options]}
          value={propertyFilters[0] ?? ""}
          onChange={(next) => onPropertyFiltersChange(next ? [next] : [])}
          dataAttr={dataAttr}
        />
      ) : (
        <FilterCheckboxList
          options={options}
          selected={propertyFilters}
          onChange={onPropertyFiltersChange}
          emptyMenuText="No properties"
          dataAttr={dataAttr}
        />
      )}
    </div>
  );
}
