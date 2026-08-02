"use client";

import {
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
}: {
  propertyOptions: { id: string; label: string }[];
  propertyFilters: string[];
  onPropertyFiltersChange: (next: string[]) => void;
  allLabel?: string;
  dataAttr?: string;
  selectionMode?: "single" | "multi";
}) {
  return (
    <FilterFieldsAccordion>
      <ApplicationFilterSortFieldsBody
        propertyOptions={propertyOptions}
        propertyFilters={propertyFilters}
        onPropertyFiltersChange={onPropertyFiltersChange}
        allLabel={allLabel}
        dataAttr={dataAttr}
        selectionMode={selectionMode}
      />
    </FilterFieldsAccordion>
  );
}

function ApplicationFilterSortFieldsBody({
  propertyOptions,
  propertyFilters,
  onPropertyFiltersChange,
  allLabel,
  dataAttr,
  selectionMode,
}: {
  propertyOptions: { id: string; label: string }[];
  propertyFilters: string[];
  onPropertyFiltersChange: (next: string[]) => void;
  allLabel: string;
  dataAttr: string;
  selectionMode: "single" | "multi";
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

  return (
    <FilterCollapsibleSection
      sectionId="property"
      label="Property"
      summary={summary}
      empty={propertyFilters.length === 0}
      menuOptionCount={selectionMode === "single" ? options.length + 1 : options.length}
      dataAttr={`${dataAttr}-trigger`}
    >
      {propertyField}
    </FilterCollapsibleSection>
  );
}
