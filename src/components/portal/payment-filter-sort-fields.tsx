"use client";

import {
  FilterFieldsAccordion,
  FilterMultiSelectDropdown,
  FilterSingleSelectDropdown,
} from "@/components/portal/filter-field-lists";
import { usePortalFilterDraft } from "@/lib/portal-filter-draft";

export type PaymentListSort = "dueSoon" | "dueLatest" | "amountDesc" | "amountAsc" | "resident";

export function PaymentFilterSortFields({
  propertyOptions,
  propertyFilters,
  onPropertyFiltersChange,
  listSort,
  onListSortChange,
  sortOptions,
  defaultListSort = "dueSoon",
}: {
  propertyOptions: { id: string; label: string }[];
  propertyFilters: string[];
  onPropertyFiltersChange: (next: string[]) => void;
  listSort: PaymentListSort;
  onListSortChange: (next: PaymentListSort) => void;
  sortOptions: { value: PaymentListSort; label: string }[];
  defaultListSort?: PaymentListSort;
}) {
  const [draftPropertyFilters, setDraftPropertyFilters] = usePortalFilterDraft(
    propertyFilters,
    onPropertyFiltersChange,
    [],
  );
  const [draftListSort, setDraftListSort] = usePortalFilterDraft(
    listSort,
    onListSortChange,
    defaultListSort,
  );

  const propertyListOptions = propertyOptions.map((option) => ({ value: option.id, label: option.label }));
  const sortListOptions = sortOptions.map((opt) => ({ value: opt.value, label: opt.label }));

  return (
    <FilterFieldsAccordion>
      <FilterMultiSelectDropdown
        sectionId="property"
        label="Property"
        options={propertyListOptions}
        selected={draftPropertyFilters}
        onChange={setDraftPropertyFilters}
        allLabel="All properties"
        emptyMenuText="No properties"
        dataAttr="payments-filter-property"
      />

      <FilterSingleSelectDropdown
        sectionId="sort"
        label="Sort"
        options={sortListOptions}
        value={draftListSort}
        onChange={(value) => setDraftListSort(value as PaymentListSort)}
        placeholder="Default sort"
        dataAttr="payments-filter-sort"
      />
    </FilterFieldsAccordion>
  );
}
