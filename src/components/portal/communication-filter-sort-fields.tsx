"use client";

import {
  FilterFieldsAccordion,
  FilterMultiSelectDropdown,
  FilterSingleSelectDropdown,
} from "@/components/portal/filter-field-lists";
import { usePortalFilterDraft } from "@/lib/portal-filter-draft";
import {
  type CommunicationFilterRole,
  type CommunicationThreadFilters,
} from "@/lib/communication-thread-filters";
import type { CommunicationListSort } from "@/lib/unified-inbox-merge";

const SORT_OPTIONS: { value: CommunicationListSort; label: string }[] = [
  { value: "recent", label: "Most recent" },
  { value: "resident", label: "Resident (A–Z)" },
];

export function CommunicationFilterSortFields({
  propertyOptions,
  roleOptions,
  filters,
  onFiltersChange,
  listSort,
  onListSortChange,
}: {
  propertyOptions: { value: string; label: string }[];
  roleOptions: { value: CommunicationFilterRole; label: string }[];
  filters: CommunicationThreadFilters;
  onFiltersChange: (next: CommunicationThreadFilters) => void;
  listSort: CommunicationListSort;
  onListSortChange: (next: CommunicationListSort) => void;
}) {
  const [draftFilters, setDraftFilters] = usePortalFilterDraft(
    filters,
    onFiltersChange,
    { propertyIds: [], roles: [], contactIds: [] },
  );
  const [draftListSort, setDraftListSort] = usePortalFilterDraft(listSort, onListSortChange, "recent");

  return (
    <FilterFieldsAccordion>
      <FilterMultiSelectDropdown
        sectionId="house"
        label="House"
        options={propertyOptions}
        selected={draftFilters.propertyIds}
        onChange={(propertyIds) => setDraftFilters({ ...draftFilters, propertyIds })}
        allLabel="All houses"
        emptyMenuText="No houses"
        dataAttr="communication-filter-house"
      />

      <FilterMultiSelectDropdown
        sectionId="role"
        label="Role"
        options={roleOptions}
        selected={draftFilters.roles}
        onChange={(roles) =>
          setDraftFilters({
            ...draftFilters,
            roles: roles as CommunicationFilterRole[],
            contactIds: [],
          })
        }
        allLabel="All roles"
        emptyMenuText="No roles"
        dataAttr="communication-filter-role"
      />

      <FilterSingleSelectDropdown
        sectionId="sort"
        label="Sort"
        options={SORT_OPTIONS}
        value={draftListSort}
        onChange={(value) => setDraftListSort(value as CommunicationListSort)}
        placeholder="Most recent"
        dataAttr="communication-filter-sort"
      />
    </FilterFieldsAccordion>
  );
}
