"use client";

import { FilterCheckboxList, FilterSingleSelectList } from "@/components/portal/filter-field-lists";

const FIELD_LABEL_CLASS = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted";

export type PaymentListSort = "dueSoon" | "dueLatest" | "amountDesc" | "amountAsc" | "resident";

export function PaymentFilterSortFields({
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
  return (
    <div className="grid gap-4">
      <div>
        <p className={FIELD_LABEL_CLASS}>Property</p>
        <FilterCheckboxList
          options={propertyOptions.map((option) => ({ value: option.id, label: option.label }))}
          selected={propertyFilters}
          onChange={onPropertyFiltersChange}
          emptyMenuText="No properties"
          dataAttr="payments-filter-property"
        />
      </div>

      {showResidentFilter ? (
        <div>
          <p className={FIELD_LABEL_CLASS}>Resident</p>
          <FilterCheckboxList
            options={residentOptions.map((option) => ({ value: option.id, label: option.label }))}
            selected={residentFilters}
            onChange={onResidentFiltersChange}
            emptyMenuText="No residents match the current filters"
            dataAttr="payments-filter-resident"
          />
        </div>
      ) : null}

      <div>
        <p className={FIELD_LABEL_CLASS}>Sort</p>
        <FilterSingleSelectList
          options={sortOptions.map((opt) => ({ value: opt.value, label: opt.label }))}
          value={listSort}
          onChange={(value) => onListSortChange(value as PaymentListSort)}
          dataAttr="payments-filter-sort"
        />
      </div>
    </div>
  );
}
