"use client";

import { FieldSingleSelect } from "@/components/ui/checkbox-multi-select";

const FIELD_LABEL_CLASS = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted";

export function ApplicationFilterSortFields({
  propertyOptions,
  propertyFilter,
  onPropertyFilterChange,
  allLabel = "All properties",
  dataAttr = "applications-filter-property",
}: {
  propertyOptions: { id: string; label: string }[];
  propertyFilter: string;
  onPropertyFilterChange: (next: string) => void;
  allLabel?: string;
  dataAttr?: string;
}) {
  const propertySelectOptions = [
    { value: "", label: allLabel },
    ...propertyOptions.map((option) => ({ value: option.id, label: option.label })),
  ];

  return (
    <div>
      <p className={FIELD_LABEL_CLASS}>Property</p>
      <FieldSingleSelect
        label="Property"
        hideLabel
        options={propertySelectOptions}
        value={propertyFilter}
        onChange={onPropertyFilterChange}
        placeholder={allLabel}
        dataAttr={dataAttr}
      />
    </div>
  );
}
