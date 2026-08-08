import type { HouseholdCharge } from "@/lib/household-charges";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import { getPropertyById } from "@/lib/rental-application/data";
import type { ResidentTourView } from "@/lib/tour-resident-link.server";

function chargeMessageSubject(charge: HouseholdCharge): string {
  const title = charge.title.trim() || "Charge";
  return `Question about ${title}`;
}

export function residentTourManagerMessageDraft(tour: ResidentTourView): {
  subject: string;
  body: string;
  managerUserId?: string;
  propertyId?: string;
  propertyTitle?: string;
} {
  const propertyTitle = tour.propertyTitle?.trim() || "your property";
  const when =
    tour.confirmedStart && tour.confirmedEnd
      ? "my confirmed tour"
      : tour.proposedStart && tour.proposedEnd
        ? "my tour request"
        : "my tour";
  return {
    subject: `Question about ${propertyTitle}`,
    body: `Hi,\n\nI'm writing about ${when} at ${propertyTitle}.\n\n`,
    managerUserId: tour.managerUserId?.trim() || undefined,
    propertyId: tour.propertyId?.trim() || undefined,
    propertyTitle: tour.propertyTitle?.trim() || undefined,
  };
}

export function residentLeaseManagerMessageDraft(
  row: LeasePipelineRow,
  options?: { leaseTitle?: string; requestEdits?: boolean },
): {
  subject: string;
  body: string;
  managerUserId?: string;
  propertyId?: string;
  propertyTitle?: string;
} {
  const propertyId = row.propertyId ?? row.application?.propertyId ?? "";
  const propertyTitle =
    (propertyId ? getPropertyById(propertyId)?.title?.trim() : "") ||
    row.unit?.trim() ||
    "my lease";
  const leaseTitle = options?.leaseTitle?.trim() || "lease agreement";
  const intro = options?.requestEdits
    ? `I'd like to request edits to ${leaseTitle} for ${propertyTitle}.`
    : `I have a question about ${leaseTitle} for ${propertyTitle}.`;
  return {
    subject: options?.requestEdits ? `Lease edit request · ${propertyTitle}` : `Question about my lease · ${propertyTitle}`,
    body: ["Hi,", "", intro, "", "Requested changes:", "", ""].join("\n"),
    managerUserId: row.managerUserId?.trim() || undefined,
    propertyId: propertyId || undefined,
    propertyTitle,
  };
}

export function residentChargeManagerMessageDraft(charge: HouseholdCharge): {
  subject: string;
  body: string;
  managerUserId?: string;
  propertyId?: string;
  propertyTitle?: string;
} {
  const propertyTitle = charge.propertyLabel?.trim() || undefined;
  return {
    subject: chargeMessageSubject(charge),
    body: [
      `Hi,`,
      ``,
      `I have a question about ${charge.title} (${charge.balanceLabel})${propertyTitle ? ` for ${propertyTitle}` : ""}.`,
      ``,
    ].join("\n"),
    managerUserId: charge.managerUserId?.trim() || undefined,
    propertyId: charge.propertyId?.trim() || undefined,
    propertyTitle,
  };
}
