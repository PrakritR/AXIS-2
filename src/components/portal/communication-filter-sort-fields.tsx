"use client";

import { CheckboxMultiSelect, FieldSingleSelect } from "@/components/ui/checkbox-multi-select";
import {
  contactsForSelectedRoles,
  type CommunicationFilterRole,
  type CommunicationThreadFilters,
} from "@/lib/communication-thread-filters";
import type { InboxScopedContact } from "@/data/inbox-scoped-directory";
import type { CommunicationListSort } from "@/lib/unified-inbox-merge";

const FIELD_LABEL_CLASS = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted";

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
    <div className="grid gap-4">
      <div>
        <p className={FIELD_LABEL_CLASS}>House</p>
        <CheckboxMultiSelect
          label="House"
          hideLabel
          options={propertyOptions}
          selected={filters.propertyIds}
          onChange={(propertyIds) => onFiltersChange({ ...filters, propertyIds })}
          emptyLabel="All houses"
          dataAttr="communication-filter-house"
        />
      </div>

      <div>
        <p className={FIELD_LABEL_CLASS}>Role</p>
        <CheckboxMultiSelect
          label="Role"
          hideLabel
          options={roleOptions}
          selected={filters.roles}
          onChange={(roles) =>
            onFiltersChange({
              ...filters,
              roles: roles as CommunicationFilterRole[],
              contactIds: [],
            })
          }
          emptyLabel="All roles"
          dataAttr="communication-filter-role"
        />
      </div>

      <div>
        <p className={FIELD_LABEL_CLASS}>Resident</p>
        <CheckboxMultiSelect
          label="Resident"
          hideLabel
          options={residentOptions}
          selected={filters.contactIds}
          onChange={(contactIds) => onFiltersChange({ ...filters, contactIds })}
          emptyLabel="All residents"
          emptyMenuText="No residents match the current filters"
          dataAttr="communication-filter-resident"
        />
      </div>

      <div>
        <p className={FIELD_LABEL_CLASS}>Sort</p>
        <FieldSingleSelect
          label="Sort"
          hideLabel
          options={SORT_OPTIONS}
          value={listSort}
          onChange={(value) => onListSortChange(value as CommunicationListSort)}
          dataAttr="communication-filter-sort"
        />
      </div>
    </div>
  );
}
