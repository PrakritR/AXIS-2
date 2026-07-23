/**
 * Resident maintenance filing. Distinct from `create_service_request`: a
 * maintenance issue becomes a WORK ORDER (`portal_work_order_records`), an
 * add-on service becomes a `ServiceRequest` — two separate models that share
 * only a nav section (see AGENTS.md, "Add-on services vs. work orders").
 */
import { z } from "zod";
import { defineWriteTool } from "../../registry";
import type { ResidentAgentContext } from "../../resident-context";
import { writeAuditLog, updateAuditResult, auditDayBucket } from "../../audit";
import { contentHash } from "./load-resident-rows";
import { resolveServiceRequestRouting } from "./services";

const reportMaintenanceSchema = z
  .object({
    description: z
      .string()
      .min(5)
      .max(2000)
      .describe(
        "What is wrong, in the resident's own words — this becomes the work order description the manager and vendor read.",
      ),
  })
  .strict();

/**
 * Gated write: file a maintenance work order for the signed-in resident.
 * Reuses `createWorkOrderFromResidentSms`, the same server function the SMS
 * channel uses, so category/priority inference, duplicate suppression, manager
 * notification, and vendor pre-dispatch all behave identically to the portal's
 * "Report maintenance" button. The manager and property are resolved from the
 * resident's own residency, never from model input.
 */
export const reportMaintenanceIssueTool = defineWriteTool({
  name: "report_maintenance_issue",
  description:
    "File a new maintenance work order for the signed-in resident (the portal's Services -> Report maintenance action). Use when the resident describes something broken or in need of repair — NOT for add-on services like parking or storage, which use create_service_request.",
  inputSchema: reportMaintenanceSchema,
  preview: async (ctx: ResidentAgentContext, input) => {
    const routing = await resolveServiceRequestRouting(ctx);
    if (!routing) {
      throw new Error("Your account isn't linked to a property manager yet, so I can't file this for you.");
    }
    return {
      kind: "report_maintenance_issue",
      title: "File a maintenance request",
      summary: `File a maintenance request with ${routing.managerLabel}.`,
      confirmLabel: "File request",
      fields: [
        { label: "Reported by", value: `${routing.residentName} (${ctx.email})` },
        { label: "Property", value: routing.propertyLabel },
        { label: "What's wrong", value: input.description },
      ],
      warnings: ["Your manager is notified as soon as this is filed."],
    };
  },
  handler: async (ctx: ResidentAgentContext, input) => {
    // Re-resolve the manager at confirm time; stored input is never ownership proof.
    const routing = await resolveServiceRequestRouting(ctx);
    if (!routing) {
      throw new Error("Your account isn't linked to a property manager yet, so I can't file this for you.");
    }

    // Record intent first, idempotent per description per day, so a double
    // confirm cannot file the same issue twice.
    const dedupeKey = `report_maintenance_issue:${ctx.landlordId}:${contentHash(input.description.trim().toLowerCase())}:${auditDayBucket()}`;
    const audit = await writeAuditLog(ctx, {
      action: "report_maintenance_issue",
      toolName: "report_maintenance_issue",
      inputSummary: { descriptionHash: contentHash(input.description.trim().toLowerCase()) },
      dedupeKey,
    });
    if (!audit.recorded) {
      if (audit.duplicate) {
        return { reply: "You already filed that maintenance request today — I didn't file a duplicate." };
      }
      throw new Error("Could not record the action; no maintenance request was filed.");
    }

    // Imported lazily: the claw maintenance lib reaches the work-order dispatch
    // path, which imports the manager registry — a static import would close
    // that cycle and leave this registry half-initialised at module load.
    const { createWorkOrderFromResidentSms } = await import("@/lib/claw-maintenance-work-order.server");
    const result = await createWorkOrderFromResidentSms({
      managerUserId: routing.managerId,
      residentPhone: "",
      residentUserId: ctx.userId,
      residentEmail: ctx.email,
      text: input.description,
      senderUserId: ctx.userId,
      // The resident explicitly asked for this, so the SMS channel's
      // "does this text look like maintenance?" heuristic must not veto it.
      skipIntentCheck: true,
    });
    if ("alreadyOpen" in result && result.alreadyOpen) {
      await updateAuditResult(ctx, dedupeKey, { alreadyOpen: true });
      return {
        reply: `You already have an open request for that (${result.title}). I didn't file a duplicate.`,
      };
    }
    if (!result.created) {
      await updateAuditResult(ctx, dedupeKey, { filed: false }, { clearDedupeKey: true });
      throw new Error("Could not file the maintenance request. Please try again from Services.");
    }
    await updateAuditResult(ctx, dedupeKey, { filed: true });
    return { reply: `Filed "${result.title}" with your manager. You can track it under Services → Work orders.` };
  },
});
