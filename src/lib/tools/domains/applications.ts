import { z } from "zod";
import { defineTool } from "../registry";
import type { AgentContext } from "../context";
import type { DemoApplicantRow } from "@/data/demo-portal";
import { resolveBackgroundCheckStatus } from "@/lib/application-background-check";
import { loadAllManagerRows } from "./load-manager-rows";

/** Server-side read of the landlord's applications, scoped by manager_user_id. */
async function loadManagerApplications(ctx: AgentContext): Promise<DemoApplicantRow[]> {
  return loadAllManagerRows(
    ctx,
    "manager_application_records",
    (rowData) => rowData as DemoApplicantRow,
  );
}

/**
 * Safe projection of an applicant. The raw `application` form (SSN, income,
 * employment, references) and the vendor `screening` report are deliberately
 * dropped — only the derived screening *status* is exposed. This is the central
 * PII guard for this domain.
 */
function summarizeApplicant(r: DemoApplicantRow) {
  return {
    id: r.id,
    name: r.name || null,
    email: (r.email || "").trim().toLowerCase() || null,
    property: r.property || null,
    stage: r.stage || null,
    bucket: r.bucket || null,
    assignedRoom: r.assignedRoomChoice || null,
    signedMonthlyRent: typeof r.signedMonthlyRent === "number" ? r.signedMonthlyRent : null,
    screeningStatus: resolveBackgroundCheckStatus(r),
    manuallyAdded: r.manuallyAdded === true,
  };
}

export const listApplicationsTool = defineTool({
  name: "list_applications",
  description:
    "List the current landlord's rental applications with applicant name, email, property, stage, status (pending/approved/rejected), and background-screening status (pending_review/passed/flagged/not_applicable). Use for 'how many applications are pending', 'which applicants are flagged in screening', etc. Sensitive application form data and raw screening reports are never returned.",
  kind: "read",
  inputSchema: z
    .object({
      bucket: z
        .enum(["pending", "approved", "rejected"])
        .optional()
        .describe("Optional filter on the application bucket."),
      screeningStatus: z
        .enum(["pending_review", "passed", "flagged", "not_applicable"])
        .optional()
        .describe("Optional filter on background-screening status."),
    })
    .strict(),
  handler: async (ctx, input) => {
    const rows = await loadManagerApplications(ctx);
    const filtered = rows
      .map((r) => ({ row: r, summary: summarizeApplicant(r) }))
      .filter(({ row, summary }) => {
        if (input.bucket && row.bucket !== input.bucket) return false;
        if (input.screeningStatus && summary.screeningStatus !== input.screeningStatus) return false;
        return true;
      })
      .map(({ summary }) => summary);
    return { count: filtered.length, applications: filtered };
  },
});
