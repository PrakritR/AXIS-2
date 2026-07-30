import { isDemoModeActive } from "@/lib/demo/demo-session";
import { applicationPatchFromLeasePacketInput, type UpdateLeasePacketInput } from "@/lib/tools/domains/leases-logic";
import {
  generateLeaseHtmlForRow,
  leaseAllowsManagerDocumentEdits,
  normalizeLeasePipelineRow,
  readLeasePipeline,
  syncLeasePipelineFromServer,
  updateLeasePipelineRow,
  type LeasePipelineRow,
} from "@/lib/lease-pipeline-storage";

export async function patchLeasePacketFromManager(
  input: UpdateLeasePacketInput,
  managerUserId?: string | null,
): Promise<{ ok: true; row: LeasePipelineRow } | { ok: false; error: string }> {
  const leaseId = input.leaseId.trim();
  if (!leaseId) return { ok: false, error: "Lease id is required." };

  if (!isDemoModeActive()) {
    try {
      const res = await fetch("/api/manager/update-lease-packet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      const json = (await res.json()) as { ok?: boolean; row?: LeasePipelineRow; error?: string };
      if (!res.ok || !json.ok || !json.row) {
        return { ok: false, error: json.error ?? "Could not save lease changes." };
      }
      await syncLeasePipelineFromServer(managerUserId, { force: true });
      const synced = readLeasePipeline(managerUserId).find((r) => r.id === leaseId);
      return synced ? { ok: true, row: synced } : { ok: true, row: normalizeLeasePipelineRow(json.row) };
    } catch {
      return { ok: false, error: "Could not save lease changes. Check your connection and try again." };
    }
  }

  const row = readLeasePipeline(managerUserId).find((r) => r.id === leaseId);
  if (!row || !leaseAllowsManagerDocumentEdits(row)) {
    return { ok: false, error: "This lease can no longer be edited." };
  }

  const appPatch = applicationPatchFromLeasePacketInput(input);
  if (!appPatch && input.unit === undefined && input.notes === undefined) {
    return { ok: false, error: "Nothing to update." };
  }

  const updatedApplication = {
    ...(row.application ?? {}),
    ...(appPatch ?? {}),
  } as NonNullable<LeasePipelineRow["application"]>;

  const saved = updateLeasePipelineRow(
    leaseId,
    {
      ...(input.unit !== undefined ? { unit: input.unit.trim() } : {}),
      ...(input.notes !== undefined ? { notes: input.notes.trim() } : {}),
      application: updatedApplication,
      status: "Manager Review",
      currentActorRole: "manager",
      bucket: "manager",
      ...(appPatch ? { managerUploadedPdf: null } : {}),
    },
    managerUserId,
  );
  if (!saved) return { ok: false, error: "Could not save lease changes locally." };

  if (appPatch) {
    const gen = generateLeaseHtmlForRow(leaseId, managerUserId);
    if (!gen.ok) return { ok: false, error: gen.error };
  }

  const updated = readLeasePipeline(managerUserId).find((r) => r.id === leaseId);
  return updated ? { ok: true, row: updated } : { ok: false, error: "Lease saved but could not be reloaded." };
}
