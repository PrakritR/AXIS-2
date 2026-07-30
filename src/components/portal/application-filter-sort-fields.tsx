"use client";

import {
  FILTER_FIELD_LABEL_CLASS,
  FilterCheckboxList,
  FilterCollapsibleSection,
  FilterFieldsAccordion,
  FilterSingleSelectList,
  filterMultiSelectSummary,
  filterSingleSelectSummary,
  useFilterAccordionClose,
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
  const body = (
    <ApplicationFilterSortFieldsBody
      propertyOptions={propertyOptions}
      propertyFilters={propertyFilters}
      onPropertyFiltersChange={onPropertyFiltersChange}
      allLabel={allLabel}
      dataAttr={dataAttr}
      selectionMode={selectionMode}
      layout={layout}
    />
  );
  if (layout === "inline") return body;
  return <FilterFieldsAccordion>{body}</FilterFieldsAccordion>;
}

function ApplicationFilterSortFieldsBody({
  propertyOptions,
  propertyFilters,
  onPropertyFiltersChange,
  allLabel,
  dataAttr,
  selectionMode,
  layout,
}: {
  propertyOptions: { id: string; label: string }[];
  propertyFilters: string[];
  onPropertyFiltersChange: (next: string[]) => void;
  allLabel: string;
  dataAttr: string;
  selectionMode: "single" | "multi";
  layout: "accordion" | "inline";
}) {
  const closeDropdown = useFilterAccordionClose();
  const options = propertyOptions.map((option) => ({ value: option.id, label: option.label }));
  const summary =
    selectionMode === "single"
      ? filterSingleSelectSummary(propertyFilters[0] ?? "", [{ value: "", label: allLabel }, ...options], allLabel)
      : filterMultiSelectSummary(propertyFilters, options, allLabel);

  const propertyField =
    selectionMode === "single" ? (
      <FilterSingleSelectList
        options={[{ value: "", label: allLabel }, ...options]}
        value={propertyFilters[0] ?? ""}
        onChange={(next) => onPropertyFiltersChange(next ? [next] : [])}
        onPick={closeDropdown}
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
    );

  if (layout === "inline") {
    return (
      <div className="flex flex-col gap-2">
        <p className={FILTER_FIELD_LABEL_CLASS}>Property</p>
        {propertyField}
      </div>
    );
  }

  return (
    <FilterCollapsibleSection sectionId="property" label="Property" summary={summary} dataAttr={`${dataAttr}-trigger`}>
      {propertyField}
    </FilterCollapsibleSection>
  );
}
