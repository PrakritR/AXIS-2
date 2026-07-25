import type { PropertyLeaseSource } from "@/lib/property-lease-source";
import { propertyLeaseSourceLabel } from "@/lib/property-lease-source";

/** Rich context for the property Lease editor modal assistant strip. */
export function buildLeaseModalAssistantContext(opts: {
  propertyId?: string | null;
  propertyIds?: string[];
  propertyLabel?: string | null;
  currentSource: PropertyLeaseSource;
}): string {
  const ids =
    opts.propertyIds?.filter((id) => id.trim()).length
      ? opts.propertyIds!.filter((id) => id.trim())
      : opts.propertyId?.trim()
        ? [opts.propertyId.trim()]
        : [];
  const parts = ["Lease modal"];
  if (ids.length === 1) {
    parts.push(`propertyId=${ids[0]}`);
  } else if (ids.length > 1) {
    parts.push(`propertyIds=${ids.join(",")}`);
    parts.push("(bulk edit — propose update_property_lease_config only for a single property at a time)");
  } else {
    parts.push("propertyId=(unknown — ask the manager which property)");
  }
  if (opts.propertyLabel?.trim()) parts.push(`property=${opts.propertyLabel.trim()}`);
  parts.push(`currentLeaseSource=${propertyLeaseSourceLabel(opts.currentSource)}`);
  parts.push(
    "Propose update_property_lease_config with propertyId above: axis_default (PropLane standard), custom_comments (+ customLeaseTerms), or custom_format (+ leaseTemplateDocUrl from an uploaded PDF).",
  );
  return parts.join(" · ");
}
