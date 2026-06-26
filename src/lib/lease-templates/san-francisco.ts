import type { LeaseGenerationContext } from "@/lib/generated-lease";
import { SAN_FRANCISCO_LEASE_CONFIG } from "@/lib/lease-templates/types";
import { buildLeaseHtml } from "@/lib/lease-templates/build-lease-html";

export function buildSanFranciscoLeaseHtml(ctx: LeaseGenerationContext): string {
  return buildLeaseHtml(ctx, SAN_FRANCISCO_LEASE_CONFIG);
}
