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

export type PaymentListSort = "dueSoon" | "dueLatest" | "amountDesc" | "amountAsc" | "resident";

export function PaymentFilterSortFields(props: {
  propertyOptions: { id: string; label: string }[];
  residentOptions: { id: string; label: string }[];
  showResidentFilter: boolean;
  propertyFilters: string[];
  onPropertyFiltersChange: (next: string[]) => void;
  residentFilters: string[];
  onResidentFiltersChange: (next: string[]) => void;
  listSort: PaymentListSort;
  onListSortChange: (next: PaymentListSort) => void;
  sortOptions: { value: PaymentListSort; label: string }[];
}) {
  return (
    <FilterFieldsAccordion>
      <PaymentFilterSortFieldsBody {...props} />
    </FilterFieldsAccordion>
  );
}

function PaymentFilterSortFieldsBody({
  propertyOptions,
  residentOptions,
  showResidentFilter,
  propertyFilters,
  onPropertyFiltersChange,
  residentFilters,
  onResidentFiltersChange,
  listSort,
  onListSortChange,
  sortOptions,
}: {
  propertyOptions: { id: string; label: string }[];
  residentOptions: { id: string; label: string }[];
  showResidentFilter: boolean;
  propertyFilters: string[];
  onPropertyFiltersChange: (next: string[]) => void;
  residentFilters: string[];
  onResidentFiltersChange: (next: string[]) => void;
  listSort: PaymentListSort;
  onListSortChange: (next: PaymentListSort) => void;
  sortOptions: { value: PaymentListSort; label: string }[];
}) {
  const propertyListOptions = propertyOptions.map((option) => ({ value: option.id, label: option.label }));
  const residentListOptions = residentOptions.map((option) => ({ value: option.id, label: option.label }));
  const sortListOptions = sortOptions.map((opt) => ({ value: opt.value, label: opt.label }));
  const closeDropdown = useFilterAccordionClose();

  return (
    <>
      <FilterCollapsibleSection
        sectionId="property"
        label="Property"
        summary={filterMultiSelectSummary(propertyFilters, propertyListOptions, "All properties")}
        empty={propertyFilters.length === 0}
        dataAttr="payments-filter-property-trigger"
      >
        <FilterCheckboxList
          options={propertyListOptions}
          selected={propertyFilters}
          onChange={onPropertyFiltersChange}
          emptyMenuText="No properties"
          dataAttr="payments-filter-property"
        />
      </FilterCollapsibleSection>

      {showResidentFilter ? (
        <FilterCollapsibleSection
          sectionId="resident"
          label="Resident"
          summary={filterMultiSelectSummary(residentFilters, residentListOptions, "All residents")}
          empty={residentFilters.length === 0}
          dataAttr="payments-filter-resident-trigger"
        >
          <FilterCheckboxList
            options={residentListOptions}
            selected={residentFilters}
            onChange={onResidentFiltersChange}
            emptyMenuText="No residents match the current filters"
            dataAttr="payments-filter-resident"
          />
        </FilterCollapsibleSection>
      ) : null}

      <FilterCollapsibleSection
        sectionId="sort"
        label="Sort"
        summary={filterSingleSelectSummary(listSort, sortListOptions, "Default sort")}
        dataAttr="payments-filter-sort-trigger"
      >
        <FilterSingleSelectList
          options={sortListOptions}
          value={listSort}
          onChange={(value) => onListSortChange(value as PaymentListSort)}
          onPick={closeDropdown}
          dataAttr="payments-filter-sort"
        />
      </FilterCollapsibleSection>
    </>
  );
}
