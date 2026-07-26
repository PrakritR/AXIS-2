import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";

/** How the lease document is produced for a property (UI-facing source id). */
export type PropertyLeaseSource = "axis_default" | "custom_comments" | "custom_format";

export const PROPERTY_LEASE_SOURCE_OPTIONS: readonly {
  id: PropertyLeaseSource;
  label: string;
  shortLabel: string;
  detail: string;
}[] = [
  {
    id: "axis_default",
    label: "PropLane default",
    shortLabel: "PropLane default",
    detail: "PropLane builds the full lease from the approved application and listing — rent, deposits, house rules, and disclosures.",
  },
  {
    id: "custom_comments",
    label: "Custom clauses",
    shortLabel: "Custom clauses",
    detail: "Add your own provisions. PropLane attaches them to the generated lease under “Additional Provisions from Property Manager”.",
  },
  {
    id: "custom_format",
    label: "Upload your lease",
    shortLabel: "Your PDF",
    detail: "Your uploaded PDF is the lease document. PropLane adds a placement summary and e-signatures.",
  },
] as const;

export function resolvePropertyLeaseSource(
  sub: Pick<ManagerListingSubmissionV1, "leaseConfigMode" | "leaseCustomKind"> | null | undefined,
): PropertyLeaseSource {
  if (!sub || sub.leaseConfigMode !== "custom") return "axis_default";
  if (sub.leaseCustomKind === "document") return "custom_format";
  return "custom_comments";
}

export function propertyLeaseSourceLabel(source: PropertyLeaseSource): string {
  return PROPERTY_LEASE_SOURCE_OPTIONS.find((o) => o.id === source)?.shortLabel ?? "PropLane default";
}

export function draftFieldsFromLeaseSource(
  source: PropertyLeaseSource,
): Pick<ManagerListingSubmissionV1, "leaseConfigMode" | "leaseCustomKind"> {
  if (source === "axis_default") return { leaseConfigMode: "standard", leaseCustomKind: "terms" };
  if (source === "custom_format") return { leaseConfigMode: "custom", leaseCustomKind: "document" };
  return { leaseConfigMode: "custom", leaseCustomKind: "terms" };
}

export function leaseSourceFromDraft(
  draft: Pick<ManagerListingSubmissionV1, "leaseConfigMode" | "leaseCustomKind">,
): PropertyLeaseSource {
  return resolvePropertyLeaseSource(draft);
}
