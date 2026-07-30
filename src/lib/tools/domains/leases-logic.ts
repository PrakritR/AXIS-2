/**
 * Pure helpers for the gated lease-draft tools. No database, no browser — the
 * draft row and its preview are built here and unit-tested in isolation. The
 * browser-coupled lease-pipeline-storage module is only used for its pure
 * exports (normalizeLeasePipelineRow, leaseAllowsManagerDocumentEdits), the
 * same pattern the read tool already relies on.
 */
import type { DemoApplicantRow } from "@/data/demo-portal";
import { normalizeLeasePipelineRow, type LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import type { ActionPreview } from "../registry";

export type CreateLeaseDraftInput = { residentEmail: string; unit?: string; notes?: string };
export type UpdateLeaseDraftInput = { leaseId: string; unit?: string; notes?: string };

/** Build a normalized Draft-stage lease row for a resolved (owned) resident. */
export function buildLeaseDraft(
  resident: DemoApplicantRow,
  input: CreateLeaseDraftInput,
  managerUserId: string,
  id: string,
  nowIso: string,
): LeasePipelineRow {
  return normalizeLeasePipelineRow({
    id,
    residentName: resident.name || "Resident",
    residentEmail: String(resident.email ?? "").trim().toLowerCase(),
    unit: input.unit?.trim() || resident.assignedRoomChoice || "",
    notes: input.notes?.trim() || "",
    bucket: "manager",
    managerUserId,
    propertyId: resident.assignedPropertyId || resident.propertyId,
    updatedAtIso: nowIso,
  });
}

/** Merge whitelisted editable fields into an existing draft and renormalize. */
export function applyLeaseDraftUpdate(
  row: LeasePipelineRow,
  input: UpdateLeaseDraftInput,
  nowIso: string,
): LeasePipelineRow {
  return normalizeLeasePipelineRow({
    ...row,
    ...(input.unit !== undefined ? { unit: input.unit.trim() } : {}),
    ...(input.notes !== undefined ? { notes: input.notes.trim() } : {}),
    updatedAtIso: nowIso,
  });
}

export function buildLeaseDraftPreview(row: LeasePipelineRow, mode: "create" | "update"): ActionPreview {
  return {
    kind: "lease_draft",
    title:
      mode === "create"
        ? `Create a lease draft for ${row.residentName}`
        : `Update the lease draft for ${row.residentName}`,
    confirmLabel: mode === "create" ? "Create draft" : "Update draft",
    fields: [
      { label: "Resident", value: `${row.residentName} <${row.residentEmail}>` },
      { label: "Unit", value: row.unit || "—" },
      { label: "Status", value: row.status ?? row.stageLabel },
      ...(row.notes ? [{ label: "Notes", value: row.notes }] : []),
    ],
  };
}

export type UpdateLeasePacketInput = {
  leaseId: string;
  unit?: string;
  notes?: string;
  monthlyRent?: number;
  monthlyUtilities?: number;
  securityDeposit?: number;
  moveInFee?: number;
  leaseStart?: string;
  leaseEnd?: string;
  leaseTerm?: string;
  roomChoice?: string;
  rentalType?: "standard" | "short_term";
};

export function applicationPatchFromLeasePacketInput(
  input: UpdateLeasePacketInput,
): Record<string, string> | null {
  const patch: Record<string, string> = {};
  const money = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
  if (input.monthlyRent !== undefined) patch.managerRentOverride = money(input.monthlyRent);
  if (input.monthlyUtilities !== undefined) patch.managerUtilitiesOverride = money(input.monthlyUtilities);
  if (input.securityDeposit !== undefined) patch.managerSecurityDepositOverride = money(input.securityDeposit);
  if (input.moveInFee !== undefined) patch.managerMoveInFeeOverride = money(input.moveInFee);
  if (input.leaseStart !== undefined) patch.leaseStart = input.leaseStart.trim();
  if (input.leaseEnd !== undefined) patch.leaseEnd = input.leaseEnd.trim();
  if (input.leaseTerm !== undefined) patch.leaseTerm = input.leaseTerm.trim();
  if (input.roomChoice !== undefined) patch.roomChoice1 = input.roomChoice.trim();
  if (input.rentalType !== undefined) patch.rentalType = input.rentalType;
  return Object.keys(patch).length ? patch : null;
}

export function buildLeasePacketPreview(row: LeasePipelineRow, input: UpdateLeasePacketInput): ActionPreview {
  const fields: { label: string; value: string }[] = [
    { label: "Resident", value: row.residentName },
    { label: "Unit", value: input.unit?.trim() || row.unit || "—" },
  ];
  const appPatch = applicationPatchFromLeasePacketInput(input);
  if (appPatch?.managerRentOverride) fields.push({ label: "Monthly rent", value: appPatch.managerRentOverride });
  if (appPatch?.managerUtilitiesOverride) fields.push({ label: "Monthly utilities", value: appPatch.managerUtilitiesOverride });
  if (appPatch?.managerSecurityDepositOverride) fields.push({ label: "Security deposit", value: appPatch.managerSecurityDepositOverride });
  if (appPatch?.managerMoveInFeeOverride) fields.push({ label: "Move-in fee", value: appPatch.managerMoveInFeeOverride });
  if (appPatch?.leaseStart) fields.push({ label: "Lease start", value: appPatch.leaseStart });
  if (appPatch?.leaseEnd) fields.push({ label: "Lease end", value: appPatch.leaseEnd || "Month-to-month" });
  if (appPatch?.leaseTerm) fields.push({ label: "Lease term", value: appPatch.leaseTerm });
  if (appPatch?.roomChoice1) fields.push({ label: "Room", value: appPatch.roomChoice1 });
  if (appPatch?.rentalType) fields.push({ label: "Stay type", value: appPatch.rentalType === "short_term" ? "Short-term" : "Long-term" });
  if (input.notes !== undefined) fields.push({ label: "Notes", value: input.notes.trim() || "—" });
  return {
    kind: "lease_packet_edit",
    title: `Update lease for ${row.residentName}`,
    summary: "Regenerates the lease document with these terms and keeps it in manager review.",
    confirmLabel: "Update lease",
    fields,
    warnings: appPatch ? ["The lease document will be regenerated with these changes."] : undefined,
  };
}

export function buildLeaseDocumentSectionsPreview(
  row: LeasePipelineRow,
  sectionBodies: Record<string, string>,
): ActionPreview {
  const ids = Object.keys(sectionBodies).filter((id) => id.trim());
  return {
    kind: "lease_document_sections_edit",
    title: "Update lease document sections",
    summary: `Update ${ids.length} section${ids.length === 1 ? "" : "s"} on the lease for ${row.residentName}.`,
    confirmLabel: "Update sections",
    fields: [
      { label: "Resident", value: row.residentName },
      { label: "Sections", value: ids.map((id) => `• ${id}`).join("\n") },
    ],
  };
}

