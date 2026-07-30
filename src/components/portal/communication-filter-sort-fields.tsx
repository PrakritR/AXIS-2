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

export function CommunicationFilterSortFields(props: {
  propertyOptions: { value: string; label: string }[];
  roleOptions: { value: CommunicationFilterRole; label: string }[];
  filterContacts: InboxScopedContact[];
  filters: CommunicationThreadFilters;
  onFiltersChange: (next: CommunicationThreadFilters) => void;
  listSort: CommunicationListSort;
  onListSortChange: (next: CommunicationListSort) => void;
}) {
  return (
    <FilterFieldsAccordion>
      <CommunicationFilterSortFieldsBody {...props} />
    </FilterFieldsAccordion>
  );
}

function CommunicationFilterSortFieldsBody({
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
  const closeDropdown = useFilterAccordionClose();
  const residentPool = contactsForSelectedRoles(filterContacts, filters.roles).filter(
    (contact) => contact.role === "resident",
  );
  const residentOptions = residentOptionsFromContacts(residentPool);

  return (
    <>
      <FilterCollapsibleSection
        sectionId="house"
        label="House"
        summary={filterMultiSelectSummary(filters.propertyIds, propertyOptions, "All houses")}
        dataAttr="communication-filter-house-trigger"
      >
        <FilterCheckboxList
          options={propertyOptions}
          selected={filters.propertyIds}
          onChange={(propertyIds) => onFiltersChange({ ...filters, propertyIds })}
          emptyMenuText="No houses"
          dataAttr="communication-filter-house"
        />
      </FilterCollapsibleSection>

      <FilterCollapsibleSection
        sectionId="role"
        label="Role"
        summary={filterMultiSelectSummary(filters.roles, roleOptions, "All roles")}
        dataAttr="communication-filter-role-trigger"
      >
        <FilterCheckboxList
          options={roleOptions}
          selected={filters.roles}
          onChange={(roles) =>
            onFiltersChange({
              ...filters,
              roles: roles as CommunicationFilterRole[],
              contactIds: [],
            })
          }
          emptyMenuText="No roles"
          dataAttr="communication-filter-role"
        />
      </FilterCollapsibleSection>

      <FilterCollapsibleSection
        sectionId="resident"
        label="Resident"
        summary={filterMultiSelectSummary(filters.contactIds, residentOptions, "All residents")}
        dataAttr="communication-filter-resident-trigger"
      >
        <FilterCheckboxList
          options={residentOptions}
          selected={filters.contactIds}
          onChange={(contactIds) => onFiltersChange({ ...filters, contactIds })}
          emptyMenuText="No residents match the current filters"
          dataAttr="communication-filter-resident"
        />
      </FilterCollapsibleSection>

      <FilterCollapsibleSection
        sectionId="sort"
        label="Sort"
        summary={filterSingleSelectSummary(listSort, SORT_OPTIONS, "Most recent")}
        dataAttr="communication-filter-sort-trigger"
      >
        <FilterSingleSelectList
          options={SORT_OPTIONS}
          value={listSort}
          onChange={(value) => onListSortChange(value as CommunicationListSort)}
          onPick={closeDropdown}
          dataAttr="communication-filter-sort"
        />
      </FilterCollapsibleSection>
    </>
  );
}
