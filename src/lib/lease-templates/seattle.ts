import type { LeaseGenerationContext } from "@/lib/generated-lease";
import { SEATTLE_LEASE_CONFIG } from "@/lib/lease-templates/types";
import { buildLeaseHtml } from "@/lib/lease-templates/build-lease-html";

export function buildSeattleLeaseHtml(ctx: LeaseGenerationContext): string {
  return buildLeaseHtml(ctx, SEATTLE_LEASE_CONFIG);
}
