import { getListingRichContent } from "@/data/listing-rich-content";
import type { MockProperty } from "@/data/types";
import { parseMonthlyRent, parseUSZip, propertyMatchesZipRadius } from "@/lib/listings-search";
import { roomMatchesBathroomFilter } from "@/lib/room-listings-catalog";

/**
 * Public catalog: one card per **property** if any room matches geo, budget, and bath filters.
 * Manager listings appear after admin approval (`adminPublishLive`); `readExtraListings()` returns only those.
 */
export function filterPropertiesForCatalog(
  properties: MockProperty[],
  opts: {
    zipRaw: string;
    radiusMiles: number;
    maxBudgetNum: number | null;
    bathroom: string;
  },
): MockProperty[] {
  const centerZip = parseUSZip(opts.zipRaw);
  const out: MockProperty[] = [];

  for (const p of properties) {
    const geoOk = centerZip === null ? true : propertyMatchesZipRadius(p.zip, opts.zipRaw, opts.radiusMiles);
    if (!geoOk) continue;

    const rich = getListingRichContent(p);
    let anyMatch = false;
    outer: for (const floor of rich.floorPlans) {
      for (const room of floor.rooms) {
        if (!roomMatchesBathroomFilter(room, opts.bathroom)) continue;
        const rentNumeric = parseMonthlyRent(room.price.replace("/month", "/ mo"));
        const budgetOk =
          opts.maxBudgetNum === null || !Number.isFinite(opts.maxBudgetNum)
            ? true
            : rentNumeric !== null && rentNumeric <= opts.maxBudgetNum;
        if (!budgetOk) continue;
        anyMatch = true;
        break outer;
      }
    }

    if (anyMatch) out.push(p);
  }

  return out;
}
