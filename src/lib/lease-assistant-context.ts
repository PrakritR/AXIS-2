import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import type { PropertyLeaseSource } from "@/lib/property-lease-source";
import { propertyLeaseSourceLabel } from "@/lib/property-lease-source";
import { readLeaseSectionsForEdit } from "@/lib/lease-section-edit.client";

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

/** Rich context for the Leases-page packet edit assistant (manager review). */
export function buildLeasePacketEditAssistantContext(row: LeasePipelineRow): string {
  const app = row.application ?? {};
  const parts = [
    `Lease packet edit`,
    `leaseId=${row.id}`,
    `resident=${row.residentName.trim() || "Resident"}`,
  ];
  if (row.unit?.trim()) parts.push(`unit=${row.unit.trim()}`);
  if (app.managerRentOverride?.trim()) parts.push(`rent=${app.managerRentOverride.trim()}`);
  if (app.managerUtilitiesOverride?.trim()) parts.push(`utilities=${app.managerUtilitiesOverride.trim()}`);
  if (app.leaseTerm?.trim()) parts.push(`term=${app.leaseTerm.trim()}`);
  if (app.leaseStart?.trim()) parts.push(`start=${app.leaseStart.trim()}`);
  if (app.leaseEnd?.trim()) parts.push(`end=${app.leaseEnd.trim()}`);
  else if (app.leaseTerm?.toLowerCase().includes("month")) parts.push("end=month-to-month");
  if (app.rentalType === "short_term") parts.push("stay=short-term");
  const sections = readLeaseSectionsForEdit(row);
  if (sections.length) {
    parts.push(
      `documentSections=${sections.map((section) => `${section.id}:${section.title}`).join(";")}`,
    );
    parts.push(
      "UI: the full lease is directly editable in Visual/HTML mode. Double-click a section to focus it and edit in place.",
    );
    parts.push(
      "Propose update_lease_document_sections with sectionBodies (section id → body HTML) for clause wording, tables, or addenda. Propose update_lease_packet for rent, fees, dates, term, room, stay type, unit label, or notes (regenerates the document).",
    );
  } else {
    parts.push(
      "Propose update_lease_packet with this leaseId when the manager asks to change rent, fees, dates, term, room, stay type, unit label, or notes. The lease document regenerates and stays in manager review.",
    );
  }
  return parts.join(" · ");
}
