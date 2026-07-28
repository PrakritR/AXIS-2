"use client";

import { useMemo } from "react";
import type { MockProperty } from "@/data/types";
import {
  PropertySearchPicker,
  type PropertySearchOption,
} from "@/components/marketing/property-search-picker";

export function ApplyPropertyPicker({
  properties,
  onSelectProperty,
}: {
  properties: MockProperty[];
  onSelectProperty: (propertyId: string) => void;
}) {
  const options: PropertySearchOption[] = useMemo(
    () =>
      properties.map((property) => ({
        id: property.id,
        title: property.title,
        subtitle: property.address || property.neighborhood,
        tags: [
          property.neighborhood,
          property.rentLabel,
          property.available ? `Available ${property.available}` : "",
        ].filter(Boolean),
        searchText: `${property.title} ${property.address} ${property.neighborhood} ${property.buildingName} ${property.unitLabel}`,
      })),
    [properties],
  );

  return (
    <div className="rounded-3xl border border-border bg-card p-7 shadow-sm">
      <p className="text-sm font-semibold text-foreground">Choose a home to apply for</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Your property manager shared several homes. Pick the one you want to apply for and we will open the
        application for that property.
      </p>
      <div className="mt-5">
        <PropertySearchPicker
          options={options}
          value={null}
          onChange={(propertyId) => {
            if (propertyId) onSelectProperty(propertyId);
          }}
          placeholder="Search by address, neighborhood, or property name…"
          emptyMessage="No properties match your search."
          listEmptyMessage="No properties are available from this link."
          ariaLabel="Search properties to apply for"
        />
      </div>
    </div>
  );
}
