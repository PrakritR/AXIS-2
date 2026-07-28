import type { LeaseGenerationContext } from "@/lib/generated-lease";
import { buildLeaseHtml } from "@/lib/lease-templates/build-lease-html";
import type { LeaseJurisdictionTemplateConfig } from "@/lib/lease-templates/types";

/**
 * Statewide Washington, for a property that is NOT in Seattle (Tacoma, Spokane, ...).
 *
 * Identical to `SEATTLE_LEASE_CONFIG` except that every Seattle specific claim is REMOVED:
 * no `municipalComplianceParagraph` naming Seattle's rental regulations, a state-only header,
 * and a governing-law paragraph without the city-ordinance clause. Every statute reference
 * carried over is RCW, which is already state level, so nothing new is authored here.
 */
export const WASHINGTON_LEASE_CONFIG: LeaseJurisdictionTemplateConfig = {
  headerSubtitle: "State of Washington",
  governingLawParagraph:
    "This Agreement is governed by the laws of the <strong>State of Washington</strong> (RCW Title 59) and, where applicable, the ordinances of the city and county in which the Premises are located. If any provision is found invalid, the remainder shall remain in full force. This document, together with any signed addenda, constitutes the entire agreement between the parties. No oral representations are binding. Amendments require written signatures of both parties.",
  shortTermPurposeParagraph:
    "The Guest is staying temporarily as a short-term lodger / guest only. This agreement does not create a landlord-tenant relationship under Washington law. The stay is intended to be exempt from RCW 59.18.040 where legally applicable.",
  lateFeeStatuteRef: "RCW 59.18.283",
  depositStatuteRef: "RCW 59.18.260–.280",
  landlordEntryStatuteRef: "RCW 59.18.150",
  residentMaintenanceStatuteRef: "RCW 59.18.130",
  landlordMaintenanceStatuteRef: "RCW 59.18.060",
  defaultNoticeStatuteRef: "RCW 59.12.030",
};

export function buildWashingtonLeaseHtml(ctx: LeaseGenerationContext): string {
  return buildLeaseHtml(ctx, WASHINGTON_LEASE_CONFIG);
}
