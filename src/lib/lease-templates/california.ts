import type { LeaseGenerationContext } from "@/lib/generated-lease";
import { buildLeaseHtml } from "@/lib/lease-templates/build-lease-html";
import type { LeaseJurisdictionTemplateConfig } from "@/lib/lease-templates/types";

/**
 * Statewide California, for a property that is NOT in San Francisco (Fremont, San Jose, ...).
 *
 * Identical to `SAN_FRANCISCO_LEASE_CONFIG` except that every San Francisco specific claim is
 * REMOVED: no `municipalComplianceParagraph` (the SF Rent Ordinance does not apply), a
 * state-only header, and a governing-law paragraph without the city-ordinance clause. Every
 * statute reference carried over is already state level, so nothing new is authored here.
 * Before this existed, `resolveLeaseJurisdiction` sent every California address to the San
 * Francisco template and the lease claimed a city it was not in.
 */
export const CALIFORNIA_LEASE_CONFIG: LeaseJurisdictionTemplateConfig = {
  headerSubtitle: "State of California",
  governingLawParagraph:
    "This Agreement is governed by the laws of the <strong>State of California</strong> and, where applicable, the ordinances of the city and county in which the Premises are located. If any provision is found invalid, the remainder shall remain in full force. This document, together with any signed addenda, constitutes the entire agreement between the parties. No oral representations are binding. Amendments require written signatures of both parties.",
  shortTermPurposeParagraph:
    "The Guest is staying temporarily as a short-term lodger / guest only. This agreement does not create a landlord-tenant relationship under California law except to the minimum extent required by applicable statute.",
  lateFeeStatuteRef: "California Civil Code",
  depositStatuteRef: "California Civil Code §§ 1950.5 et seq.",
  landlordEntryStatuteRef: "California Civil Code § 1954",
  residentMaintenanceStatuteRef: "California Civil Code",
  defaultNoticeStatuteRef: "California Code of Civil Procedure",
};

export function buildCaliforniaLeaseHtml(ctx: LeaseGenerationContext): string {
  return buildLeaseHtml(ctx, CALIFORNIA_LEASE_CONFIG);
}
