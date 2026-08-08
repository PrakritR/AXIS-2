import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { residentSmsLinkOrigin } from "@/lib/claw-resident-links";
import { deliverPortalInboxMessage } from "@/lib/portal-inbox-delivery";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";

export type LeaseRenewalRequestKind = "extend" | "renew";

function leaseReviewPath(): string {
  return `${residentSmsLinkOrigin()}/portal/leases/manager`;
}

export async function notifyManagerOfLeaseRenewalRequest(
  db: SupabaseClient,
  input: {
    kind: LeaseRenewalRequestKind;
    senderUserId: string;
    senderEmail: string;
    senderName?: string;
    managerUserId: string;
    leaseRow: LeasePipelineRow;
    propertyLabel?: string;
    newLeaseEnd?: string;
    leaseTerm?: string;
    leaseStart?: string;
  },
): Promise<void> {
  const managerUserId = input.managerUserId.trim();
  if (!managerUserId) return;

  const residentName = input.senderName?.trim() || input.leaseRow.residentName?.trim() || "Resident";
  const unit = input.leaseRow.unit?.trim();
  const property = input.propertyLabel?.trim() || unit || "assigned property";
  const kindLabel = input.kind === "renew" ? "lease renewal" : "lease extension";
  const termLine =
    input.kind === "renew"
      ? [
          input.leaseTerm?.trim() ? `Term: ${input.leaseTerm.trim()}` : null,
          input.leaseStart?.trim() ? `Start: ${input.leaseStart.trim()}` : null,
          input.newLeaseEnd?.trim() ? `End: ${input.newLeaseEnd.trim()}` : "End: Month-to-month",
        ]
          .filter(Boolean)
          .join("\n")
      : input.newLeaseEnd?.trim()
        ? `New move-out date: ${input.newLeaseEnd.trim()}`
        : null;

  const subject =
    input.kind === "renew"
      ? `Lease renewal requested · ${property}`
      : `Lease extension requested · ${property}`;

  const text = [
    `${residentName} requested a ${kindLabel}.`,
    "",
    `Resident: ${residentName}`,
    `Resident email: ${input.senderEmail.trim()}`,
    `Property: ${property}`,
    unit ? `Unit: ${unit}` : null,
    termLine,
    "",
    "A new lease document has been generated and is waiting in Manager Review. Review it and send it to the resident for signature.",
    "",
    `Review: ${leaseReviewPath()}`,
  ]
    .filter(Boolean)
    .join("\n");

  const smsText = [
    `(Lease ${input.kind === "renew" ? "renewal" : "extension"} requested)`,
    `${residentName} · ${property}`,
    `Review: ${leaseReviewPath()}`,
  ].join("\n");

  await deliverPortalInboxMessage(db, {
    senderUserId: input.senderUserId,
    senderEmail: input.senderEmail,
    fromName: residentName,
    subject,
    text,
    toUserIds: [managerUserId],
    eventCategory: "leases",
    smsText,
  }).catch(() => undefined);
}
