import { z } from "zod";
import { defineTool } from "../registry";
import type { AgentContext } from "../context";
import { normalizeLeasePipelineRow, type LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import { loadAllManagerRows } from "./load-manager-rows";

/** Server-side read of the landlord's lease pipeline, scoped by manager_user_id. */
async function loadManagerLeases(ctx: AgentContext): Promise<LeasePipelineRow[]> {
  return loadAllManagerRows(
    ctx,
    "portal_lease_pipeline_records",
    (rowData) => normalizeLeasePipelineRow(rowData),
  );
}

export const listLeasesTool = defineTool({
  name: "list_leases",
  description:
    "List the current landlord's leases with their status (Draft, Manager Review, Admin Review, Resident Signature Pending, Manager Signature Pending, Fully Signed, Voided), resident, and property. Use to answer questions about lease status or how many leases are awaiting signature.",
  kind: "read",
  inputSchema: z
    .object({
      status: z
        .string()
        .optional()
        .describe("Optional case-insensitive filter on lease status, e.g. 'Fully Signed'."),
    })
    .strict(),
  handler: async (ctx, input) => {
    const rows = await loadManagerLeases(ctx);
    const wanted = input.status?.trim().toLowerCase();
    const filtered = wanted
      ? rows.filter((r) => String(r.status ?? r.stageLabel ?? "").toLowerCase() === wanted)
      : rows;
    return {
      count: filtered.length,
      leases: filtered.map((r) => ({
        id: r.id,
        status: r.status ?? r.stageLabel ?? null,
        residentName: r.residentName || null,
        residentEmail: r.residentEmail || null,
        unit: r.unit || null,
      })),
    };
  },
});
