import type { LeaseGenerationContext } from "@/lib/generated-lease";
import { buildLeaseHtml } from "@/lib/lease-templates/build-lease-html";
import { WASHINGTON_LEASE_CONFIG } from "@/lib/lease-templates/types";

export { WASHINGTON_LEASE_CONFIG };

/**
 * Statewide Washington, for a property that is NOT in Seattle (Tacoma, Spokane, ...).
 *
 * `SEATTLE_LEASE_CONFIG` derives from `WASHINGTON_LEASE_CONFIG` in `types.ts`, so the
 * state-level statutes and terms are written once and only city-specific values differ.
 */
export function buildWashingtonLeaseHtml(ctx: LeaseGenerationContext): string {
  return buildLeaseHtml(ctx, WASHINGTON_LEASE_CONFIG);
}
