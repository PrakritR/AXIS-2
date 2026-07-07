import type { PropertySearchOption } from "@/components/marketing/property-search-picker";
import { getListingRichContent } from "@/data/listing-rich-content";
import type { MockProperty } from "@/data/types";
import { isPropertyActiveForLeads, readExtraListingsPublic } from "@/lib/demo-property-pipeline";
import { isProductionPublicSite } from "@/lib/public-demo-access";
import { filterSandboxFromPublicCatalog } from "@/lib/public-sandbox-listings";

function listingThumbnailUrl(property: MockProperty): string | undefined {
  return getListingRichContent(property).heroHousePhotoUrls?.[0];
}

export function publicListingSearchOptions(properties: MockProperty[]): PropertySearchOption[] {
  return properties
    .filter(isPropertyActiveForLeads)
    .map((p) => ({
      id: p.id,
      title: p.title,
      subtitle: [p.neighborhood, p.rentLabel].filter(Boolean).join(" · "),
      imageUrl: listingThumbnailUrl(p),
      searchText: [p.buildingName, p.address, p.zip, p.neighborhood, p.unitLabel].filter(Boolean).join(" "),
      tags: p.petFriendly ? ["Pet friendly"] : undefined,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function readPublicListingSearchOptions(): PropertySearchOption[] {
  const listings = filterSandboxFromPublicCatalog(readExtraListingsPublic(), {
    production: isProductionPublicSite(),
  });
  return publicListingSearchOptions(listings);
}
