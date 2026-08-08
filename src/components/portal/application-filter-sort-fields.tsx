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
import { usePortalFilterDraft } from "@/lib/portal-filter-draft";

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
  const closeFieldMenu = useFilterAccordionClose();
  const [draftPropertyFilters, setDraftPropertyFilters] = usePortalFilterDraft(
    propertyFilters,
    onPropertyFiltersChange,
    [],
  );

  const options = propertyOptions.map((option) => ({ value: option.id, label: option.label }));
  const summary =
    selectionMode === "single"
      ? filterSingleSelectSummary(draftPropertyFilters[0] ?? "", [{ value: "", label: allLabel }, ...options], allLabel)
      : filterMultiSelectSummary(draftPropertyFilters, options, allLabel);

  const propertyField =
    selectionMode === "single" ? (
      <FilterSingleSelectList
        options={[{ value: "", label: allLabel }, ...options]}
        value={draftPropertyFilters[0] ?? ""}
        onChange={(next) => setDraftPropertyFilters(next ? [next] : [])}
        onPick={closeFieldMenu}
        dataAttr={dataAttr}
      />
    ) : (
      <FilterCheckboxList
        options={options}
        selected={draftPropertyFilters}
        onChange={setDraftPropertyFilters}
        emptyMenuText="No properties"
        dataAttr={dataAttr}
      />
    );

  return (
    <FilterCollapsibleSection
      sectionId="property"
      label="Property"
      summary={summary}
      empty={draftPropertyFilters.length === 0}
      menuOptionCount={selectionMode === "single" ? options.length + 1 : options.length}
      dataAttr={`${dataAttr}-trigger`}
    >
      {propertyField}
    </FilterCollapsibleSection>
  );
}
