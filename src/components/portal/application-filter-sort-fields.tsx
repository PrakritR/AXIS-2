"use client";

import {
  FILTER_FIELD_LABEL_CLASS,
  FilterMultiSelectDropdown,
  FilterSingleSelectDropdown,
} from "@/components/portal/filter-field-lists";

export function ApplicationFilterSortFields({
  propertyOptions,
  propertyFilters,
  onPropertyFiltersChange,
  allLabel = "All properties",
  dataAttr = "applications-filter-property",
  selectionMode = "multi",
  layout = "accordion",
}: {
  propertyOptions: { id: string; label: string }[];
  propertyFilters: string[];
  onPropertyFiltersChange: (next: string[]) => void;
  allLabel?: string;
  dataAttr?: string;
  selectionMode?: "single" | "multi";
  layout?: "accordion" | "inline";
}) {
  const options = propertyOptions.map((option) => ({ value: option.id, label: option.label }));

  if (selectionMode === "single") {
    const singleOptions = [{ value: "", label: allLabel }, ...options];
    return (
      <FilterSingleSelectDropdown
        label="Property"
        options={singleOptions}
        value={propertyFilters[0] ?? ""}
        onChange={(next) => onPropertyFiltersChange(next ? [next] : [])}
        placeholder={allLabel}
        dataAttr={dataAttr}
      />
    );
  }

  if (layout === "inline") {
    return (
      <div className="flex flex-col gap-2">
        <p className={FILTER_FIELD_LABEL_CLASS}>Property</p>
        <FilterMultiSelectDropdown
          label="Property"
          hideLabel
          options={options}
          selected={propertyFilters}
          onChange={onPropertyFiltersChange}
          allLabel={allLabel}
          emptyMenuText="No properties"
          dataAttr={dataAttr}
        />
      </div>
    );
  }

  return (
    <FilterMultiSelectDropdown
      label="Property"
      options={options}
      selected={propertyFilters}
      onChange={onPropertyFiltersChange}
      allLabel={allLabel}
      emptyMenuText="No properties"
      dataAttr={dataAttr}
    />
  );
}
