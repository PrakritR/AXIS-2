import type { LeaseGenerationContext } from "@/lib/generated-lease";
import { buildLeaseHtml } from "@/lib/lease-templates/build-lease-html";
import { CALIFORNIA_LEASE_CONFIG } from "@/lib/lease-templates/types";

export { CALIFORNIA_LEASE_CONFIG };

/**
 * Statewide California, for a property that is NOT in San Francisco (Fremont, San Jose, ...).
 *
 * Before this existed, `resolveLeaseJurisdiction` sent every California address to the San
 * Francisco template, so the lease claimed a city it was not in and carried the SF Rent
 * Ordinance. The config lives in `types.ts` beside the city configs, which derive from it.
 */
export function buildCaliforniaLeaseHtml(ctx: LeaseGenerationContext): string {
  return buildLeaseHtml(ctx, CALIFORNIA_LEASE_CONFIG);
}
