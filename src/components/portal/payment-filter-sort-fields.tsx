"use client";

import {
  FilterFieldsAccordion,
  FilterMultiSelectDropdown,
  FilterSingleSelectDropdown,
} from "@/components/portal/filter-field-lists";

export type PaymentListSort = "dueSoon" | "dueLatest" | "amountDesc" | "amountAsc" | "resident";

export function PaymentFilterSortFields({
  propertyOptions,
  personOptions,
  personLabel,
  propertyFilters,
  onPropertyFiltersChange,
  residentFilters,
  onResidentFiltersChange,
  listSort,
  onListSortChange,
  sortOptions,
}: {
  propertyOptions: { id: string; label: string }[];
  personOptions: { id: string; label: string }[];
  personLabel: string;
  propertyFilters: string[];
  onPropertyFiltersChange: (next: string[]) => void;
  residentFilters: string[];
  onResidentFiltersChange: (next: string[]) => void;
  listSort: PaymentListSort;
  onListSortChange: (next: PaymentListSort) => void;
  sortOptions: { value: PaymentListSort; label: string }[];
}) {
  const propertyListOptions = propertyOptions.map((option) => ({ value: option.id, label: option.label }));
  const personListOptions = personOptions.map((option) => ({ value: option.id, label: option.label }));
  const sortListOptions = sortOptions.map((opt) => ({ value: opt.value, label: opt.label }));

  return (
    <FilterFieldsAccordion>
      <FilterMultiSelectDropdown
        sectionId="property"
        label="Property"
        options={propertyListOptions}
        selected={propertyFilters}
        onChange={onPropertyFiltersChange}
        allLabel="All properties"
        emptyMenuText="No properties"
        dataAttr="payments-filter-property"
      />

      {personOptions.length > 0 ? (
        <FilterMultiSelectDropdown
          sectionId="resident"
          label={personLabel}
          options={personListOptions}
          selected={residentFilters}
          onChange={onResidentFiltersChange}
          allLabel={personLabel === "Payee" ? "All payees" : "All residents"}
          emptyMenuText={
            personLabel === "Payee"
              ? "No payees match the current filters"
              : "No residents match the current filters"
          }
          dataAttr="payments-filter-resident"
        />
      ) : null}

      <FilterSingleSelectDropdown
        sectionId="sort"
        label="Sort"
        options={sortListOptions}
        value={listSort}
        onChange={(value) => onListSortChange(value as PaymentListSort)}
        placeholder="Default sort"
        dataAttr="payments-filter-sort"
      />
    </FilterFieldsAccordion>
  );
}
