import { z } from "zod";
import { defineTool } from "../registry";
import type { AgentContext } from "../context";
import type { DemoApplicantRow } from "@/data/demo-portal";
import { loadAllManagerRows } from "./load-manager-rows";

/**
 * Residents are approved applicants. They live in the same
 * `manager_application_records` table as applications, distinguished by
 * `bucket === "approved"`.
 */
async function loadManagerApplications(ctx: AgentContext): Promise<DemoApplicantRow[]> {
  return loadAllManagerRows(
    ctx,
    "manager_application_records",
    (rowData) => rowData as DemoApplicantRow,
  );
}

/** Safe projection of a resident (no application form / screening payloads). */
function summarizeResident(r: DemoApplicantRow) {
  return {
    id: r.id,
    name: r.name || null,
    email: (r.email || "").trim().toLowerCase() || null,
    property: r.property || null,
    assignedRoom: r.assignedRoomChoice || null,
    monthlyRent: typeof r.signedMonthlyRent === "number" ? r.signedMonthlyRent : null,
    moveInInstructions: r.moveInInstructions || null,
    manuallyAdded: r.manuallyAdded === true,
  };
}

export const listResidentsTool = defineTool({
  name: "list_residents",
  description:
    "List the current landlord's active residents (approved applicants) with name, email, property, room, and monthly rent. Use to answer 'who are my tenants', 'which residents live at a property', etc. Sensitive application and screening data is never returned.",
  kind: "read",
  inputSchema: z
    .object({
      property: z
        .string()
        .optional()
        .describe("Optional case-insensitive filter on the property label."),
    })
    .strict(),
  handler: async (ctx, input) => {
    const wantProperty = input.property?.trim().toLowerCase();
    const residents = (await loadManagerApplications(ctx))
      .filter((r) => r.bucket === "approved")
      .filter((r) => !wantProperty || String(r.property ?? "").toLowerCase().includes(wantProperty))
      .map(summarizeResident);
    return { count: residents.length, residents };
  },
});
