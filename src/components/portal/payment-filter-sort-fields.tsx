"use client";

import {
  FilterCheckboxList,
  FilterCollapsibleSection,
  FilterFieldsAccordion,
  FilterSingleSelectList,
  filterMultiSelectSummary,
  filterSingleSelectSummary,
} from "@/components/portal/filter-field-lists";
import { usePortalFilterDraft } from "@/lib/portal-filter-draft";

export type PaymentListSort = "dueSoon" | "dueLatest" | "amountDesc" | "amountAsc" | "resident";

export function PaymentFilterSortFields({
  propertyOptions,
  propertyFilters,
  onPropertyFiltersChange,
  residentOptions,
  residentFilters,
  onResidentFiltersChange,
  showResidentFilter = true,
  listSort,
  onListSortChange,
  sortOptions,
  defaultListSort = "dueSoon",
}: {
  propertyOptions: { id: string; label: string }[];
  propertyFilters: string[];
  onPropertyFiltersChange: (next: string[]) => void;
  residentOptions: { id: string; label: string }[];
  residentFilters: string[];
  onResidentFiltersChange: (next: string[]) => void;
  showResidentFilter?: boolean;
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
  const [draftResidentFilters, setDraftResidentFilters] = usePortalFilterDraft(
    residentFilters,
    onResidentFiltersChange,
    [],
  );
  const [draftListSort, setDraftListSort] = usePortalFilterDraft(
    listSort,
    onListSortChange,
    defaultListSort,
  );

  const propertyListOptions = propertyOptions.map((option) => ({ value: option.id, label: option.label }));
  const residentListOptions = residentOptions.map((option) => ({ value: option.id, label: option.label }));
  const sortListOptions = sortOptions.map((opt) => ({ value: opt.value, label: opt.label }));

  return (
    <FilterFieldsAccordion>
      {propertyOptions.length > 0 ? (
        <FilterCollapsibleSection
          sectionId="property"
          label="Property"
          summary={filterMultiSelectSummary(draftPropertyFilters, propertyListOptions, "All properties")}
          empty={draftPropertyFilters.length === 0}
          menuOptionCount={propertyListOptions.length}
          dataAttr="payments-filter-property-trigger"
        >
          <FilterCheckboxList
            options={propertyListOptions}
            selected={draftPropertyFilters}
            onChange={setDraftPropertyFilters}
            emptyMenuText="No properties"
            dataAttr="payments-filter-property"
          />
        </FilterCollapsibleSection>
      ) : null}

      {showResidentFilter && residentListOptions.length > 0 ? (
        <FilterCollapsibleSection
          sectionId="resident"
          label="Resident"
          summary={filterMultiSelectSummary(draftResidentFilters, residentListOptions, "All residents")}
          empty={draftResidentFilters.length === 0}
          menuOptionCount={residentListOptions.length}
          dataAttr="payments-filter-resident-trigger"
        >
          <FilterCheckboxList
            options={residentListOptions}
            selected={draftResidentFilters}
            onChange={setDraftResidentFilters}
            emptyMenuText="No residents"
            dataAttr="payments-filter-resident"
          />
        </FilterCollapsibleSection>
      ) : null}

      {sortListOptions.length > 0 ? (
        <FilterCollapsibleSection
          sectionId="sort"
          label="Sort"
          summary={filterSingleSelectSummary(draftListSort, sortListOptions, "Default sort")}
          empty={draftListSort === defaultListSort}
          menuOptionCount={sortListOptions.length}
          dataAttr="payments-filter-sort-trigger"
        >
          <FilterSingleSelectList
            options={sortListOptions}
            value={draftListSort}
            onChange={(value) => setDraftListSort(value as PaymentListSort)}
            dataAttr="payments-filter-sort"
          />
        </FilterCollapsibleSection>
      ) : null}
    </FilterFieldsAccordion>
  );
}
