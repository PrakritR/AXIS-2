import type { PropertySearchOption } from "@/components/marketing/property-search-picker";
import type { MockProperty } from "@/data/types";
import { isPropertyActiveForLeads, readExtraListingsPublic } from "@/lib/demo-property-pipeline";

export function publicListingSearchOptions(properties: MockProperty[]): PropertySearchOption[] {
  return properties
    .filter(isPropertyActiveForLeads)
    .map((p) => ({
      id: p.id,
      title: p.title,
      subtitle: [p.neighborhood, p.rentLabel].filter(Boolean).join(" · "),
      searchText: [p.buildingName, p.address, p.zip, p.neighborhood, p.unitLabel].filter(Boolean).join(" "),
      tags: p.petFriendly ? ["Pet friendly"] : undefined,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function readPublicListingSearchOptions(): PropertySearchOption[] {
  return publicListingSearchOptions(readExtraListingsPublic());
}
