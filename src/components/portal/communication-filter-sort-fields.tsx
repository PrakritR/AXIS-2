"use client";

import {
  FilterFieldsAccordion,
  FilterMultiSelectDropdown,
  FilterSingleSelectDropdown,
} from "@/components/portal/filter-field-lists";
import {
  contactsForSelectedRoles,
  type CommunicationFilterRole,
  type CommunicationThreadFilters,
} from "@/lib/communication-thread-filters";
import type { InboxScopedContact } from "@/data/inbox-scoped-directory";
import type { CommunicationListSort } from "@/lib/unified-inbox-merge";

const SORT_OPTIONS: { value: CommunicationListSort; label: string }[] = [
  { value: "recent", label: "Most recent" },
  { value: "resident", label: "Resident (A–Z)" },
];

function residentOptionsFromContacts(contacts: InboxScopedContact[]) {
  return contacts
    .filter((c) => c.role === "resident")
    .map((c) => {
      const status = c.tenancyStatus === "applicant" ? "Applicant" : "Resident";
      const house = c.propertyLabel?.trim();
      const bits = [c.name, status, house].filter(Boolean);
      return {
        value: c.id,
        label: bits.join(" · "),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

export function CommunicationFilterSortFields({
  propertyOptions,
  roleOptions,
  filterContacts,
  filters,
  onFiltersChange,
  listSort,
  onListSortChange,
}: {
  propertyOptions: { value: string; label: string }[];
  roleOptions: { value: CommunicationFilterRole; label: string }[];
  filterContacts: InboxScopedContact[];
  filters: CommunicationThreadFilters;
  onFiltersChange: (next: CommunicationThreadFilters) => void;
  listSort: CommunicationListSort;
  onListSortChange: (next: CommunicationListSort) => void;
}) {
  const residentPool = contactsForSelectedRoles(filterContacts, filters.roles).filter(
    (contact) => contact.role === "resident",
  );
  const residentOptions = residentOptionsFromContacts(residentPool);

  return (
    <FilterFieldsAccordion>
      <FilterMultiSelectDropdown
        sectionId="house"
        label="House"
        options={propertyOptions}
        selected={filters.propertyIds}
        onChange={(propertyIds) => onFiltersChange({ ...filters, propertyIds })}
        allLabel="All houses"
        emptyMenuText="No houses"
        dataAttr="communication-filter-house"
      />

      <FilterMultiSelectDropdown
        sectionId="role"
        label="Role"
        options={roleOptions}
        selected={filters.roles}
        onChange={(roles) =>
          onFiltersChange({
            ...filters,
            roles: roles as CommunicationFilterRole[],
            contactIds: [],
          })
        }
        allLabel="All roles"
        emptyMenuText="No roles"
        dataAttr="communication-filter-role"
      />

      <FilterMultiSelectDropdown
        sectionId="resident"
        label="Resident"
        options={residentOptions}
        selected={filters.contactIds}
        onChange={(contactIds) => onFiltersChange({ ...filters, contactIds })}
        allLabel="All residents"
        emptyMenuText="No residents match the current filters"
        dataAttr="communication-filter-resident"
      />

      <FilterSingleSelectDropdown
        sectionId="sort"
        label="Sort"
        options={SORT_OPTIONS}
        value={listSort}
        onChange={(value) => onListSortChange(value as CommunicationListSort)}
        placeholder="Most recent"
        dataAttr="communication-filter-sort"
      />
    </FilterFieldsAccordion>
  );
}
