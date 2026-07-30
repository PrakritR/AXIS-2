"use client";

import { FieldSingleSelect } from "@/components/ui/checkbox-multi-select";

const FIELD_LABEL_CLASS = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted";

export type PaymentListSort = "dueSoon" | "dueLatest" | "amountDesc" | "amountAsc" | "resident";

export function PaymentFilterSortFields({
  propertyOptions,
  residentOptions,
  showResidentFilter,
  propertyFilter,
  onPropertyFilterChange,
  residentFilter,
  onResidentFilterChange,
  listSort,
  onListSortChange,
  sortOptions,
}: {
  propertyOptions: { id: string; label: string }[];
  residentOptions: { id: string; label: string }[];
  showResidentFilter: boolean;
  propertyFilter: string;
  onPropertyFilterChange: (next: string) => void;
  residentFilter: string;
  onResidentFilterChange: (next: string) => void;
  listSort: PaymentListSort;
  onListSortChange: (next: PaymentListSort) => void;
  sortOptions: { value: PaymentListSort; label: string }[];
}) {
  const propertySelectOptions = [
    { value: "", label: "All properties" },
    ...propertyOptions.map((option) => ({ value: option.id, label: option.label })),
  ];
  const residentSelectOptions = [
    { value: "", label: "All residents" },
    ...residentOptions.map((option) => ({ value: option.id, label: option.label })),
  ];

  return (
    <div className="grid gap-4">
      <div>
        <p className={FIELD_LABEL_CLASS}>Property</p>
        <FieldSingleSelect
          label="Property"
          hideLabel
          options={propertySelectOptions}
          value={propertyFilter}
          onChange={onPropertyFilterChange}
          placeholder="All properties"
          dataAttr="payments-filter-property"
        />
      </div>

      {showResidentFilter ? (
        <div>
          <p className={FIELD_LABEL_CLASS}>Resident</p>
          <FieldSingleSelect
            label="Resident"
            hideLabel
            options={residentSelectOptions}
            value={residentFilter}
            onChange={onResidentFilterChange}
            placeholder="All residents"
            dataAttr="payments-filter-resident"
          />
        </div>
      ) : null}

      <div>
        <p className={FIELD_LABEL_CLASS}>Sort</p>
        <FieldSingleSelect
          label="Sort"
          hideLabel
          options={sortOptions}
          value={listSort}
          onChange={(value) => onListSortChange(value as PaymentListSort)}
          dataAttr="payments-filter-sort"
        />
      </div>
    </div>
  );
}
