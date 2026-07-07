/**
 * Housing search over the PUBLIC listing catalog (the same data behind
 * `/api/property-records/public` and the resident marketing search). Unlike
 * every other module in `src/lib/tools/domains/`, this is intentionally NOT a
 * `defineTool(...)` on the landlord-scoped registry: there is no landlordId to
 * scope by — the catalog spans every manager's admin-approved live listings and
 * is already served without auth. It still lives in the tool layer because it's
 * the single typed function backing both the resident search UI and the AI
 * housing-search chat, so results can never drift between the two callers and
 * the AI can never see anything the UI couldn't already show.
 */
import { z } from "zod";
import { getPublicListings } from "@/lib/public-listings.server";
import { filterRoomListings, type RoomListingRow } from "@/lib/room-listings-catalog";

export const HOUSING_SEARCH_FILTERS_SCHEMA = z.object({
  moveIn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Desired move-in date as YYYY-MM-DD, only if the visitor mentioned one."),
  moveOut: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Desired move-out date as YYYY-MM-DD, only if the visitor mentioned one."),
  maxBudget: z
    .number()
    .positive()
    .optional()
    .describe("Maximum monthly rent in USD, only if the visitor gave a budget."),
  bedroom: z
    .enum(["studio", "1", "2", "3"])
    .optional()
    .describe("Bedroom count. Use '3' for three or more bedrooms. Omit if not mentioned."),
  bathroom: z
    .enum(["private", "2-share", "3-share", "4-share"])
    .optional()
    .describe("Bathroom setup, only if the visitor mentioned one (e.g. private/en-suite bath)."),
  petFriendly: z
    .literal(true)
    .optional()
    .describe("Set true ONLY if the visitor explicitly wants pet-friendly housing."),
  neighborhood: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Neighborhood or area name the visitor mentioned, e.g. Ballard, Capitol Hill."),
} satisfies Record<string, z.ZodTypeAny>);

export type HousingSearchFilters = z.infer<typeof HOUSING_SEARCH_FILTERS_SCHEMA>;

export type HousingSearchResult = {
  filters: HousingSearchFilters & { neighborhood?: string };
  matches: RoomListingRow[];
  totalActiveListings: number;
};

/** Case-insensitive match against a real neighborhood in the catalog, so a fuzzy model guess ("ballard") lands on the canonical value the UI dropdown uses. */
function resolveNeighborhood(raw: string | undefined, neighborhoods: string[]): string | undefined {
  if (!raw) return undefined;
  const needle = raw.trim().toLowerCase();
  if (!needle) return undefined;
  return neighborhoods.find((n) => n.toLowerCase() === needle || n.toLowerCase().includes(needle));
}

/**
 * Tool-grounded housing search: resolves filters against the real public
 * catalog and returns only actual matches — never model-invented listings.
 */
export async function searchPublicHousing(rawFilters: HousingSearchFilters): Promise<HousingSearchResult> {
  const listings = await getPublicListings();
  const neighborhoods = [...new Set(listings.map((p) => p.neighborhood).filter(Boolean))];
  const neighborhood = resolveNeighborhood(rawFilters.neighborhood, neighborhoods);

  const filters: HousingSearchResult["filters"] = {
    ...rawFilters,
    neighborhood,
  };

  const matches = filterRoomListings(listings, {
    zipRaw: "",
    radiusMiles: 50,
    maxBudgetNum: filters.maxBudget ?? null,
    bathroom: filters.bathroom ?? "any",
    bedroom: filters.bedroom ?? "any",
    petFriendly: filters.petFriendly === true,
    neighborhood: filters.neighborhood ?? "any",
    moveIn: filters.moveIn,
    moveOut: filters.moveOut,
  });

  return { filters, matches, totalActiveListings: listings.length };
}
