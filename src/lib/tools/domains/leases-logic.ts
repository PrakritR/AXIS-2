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
