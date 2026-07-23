import { z } from "zod";
import { defineWriteTool } from "../registry";
import type { AgentContext } from "../context";
import {
  confirmTourInquiry,
  INQUIRIES_RECORD_ID,
  rowsFromRecord,
} from "@/lib/tour-inquiry-confirm.server";
import { buildTourConfirmPreview } from "@/lib/tour-proposal.server";

function text(row: Record<string, unknown> | null | undefined, key: string): string {
  const value = row?.[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Load the pending tour inquiry the manager (or an admin) owns. Re-derived from
 * authoritative server state at both preview and confirm time — the caller's
 * ownership is enforced here, never taken from model/client input.
 */
async function loadOwnedPendingTour(ctx: AgentContext, inquiryId: string): Promise<Record<string, unknown>> {
  const { data } = await ctx.db
    .from("portal_schedule_records")
    .select("row_data")
    .eq("id", INQUIRIES_RECORD_ID)
    .maybeSingle();
  const row = rowsFromRecord(data?.row_data).find((item) => text(item, "id") === inquiryId);
  if (!row || text(row, "kind") !== "tour" || text(row, "status") !== "pending") {
    throw new Error("That tour request is no longer pending.");
  }
  const managerUserId = text(row, "managerUserId");
  if (!managerUserId || (!ctx.isAdmin && managerUserId !== ctx.userId)) {
    throw new Error("That tour request is not yours to confirm.");
  }
  return row;
}

const inputSchema = z
  .object({
    inquiryId: z.string().min(1).describe("The pending tour inquiry id to confirm."),
    start: z.string().min(1).describe("ISO start of the slot to book, from the proposed open availability slot."),
    end: z.string().min(1).describe("ISO end of the slot to book."),
  })
  .strict();

/**
 * Gated write: confirm a pending tour inquiry into a booked event and notify the
 * guest. Proposed by the approval-first auto-tour flow (or the manager asking
 * the assistant), executed ONLY after explicit confirmation through the pending
 * -action gate. The handler re-resolves the inquiry and refuses a slot a
 * confirmed tour already occupies (`guardDoubleBook`), so a stale approval can
 * never double-book.
 */
export const confirmTourInquiryTool = defineWriteTool<z.infer<typeof inputSchema>, { reply: string }>({
  name: "confirm_tour_inquiry",
  description:
    "Confirm a pending tour request into a booked tour at the given open slot and notify the guest. The manager sees the exact time and guest and must confirm before anything is booked or sent.",
  inputSchema,
  preview: async (ctx, input) => {
    const row = await loadOwnedPendingTour(ctx, input.inquiryId);
    return buildTourConfirmPreview(row, { start: input.start, end: input.end });
  },
  handler: async (ctx, input) => {
    // Re-authorize + re-resolve before writing; ownership is not trusted from input.
    await loadOwnedPendingTour(ctx, input.inquiryId);
    const result = await confirmTourInquiry(ctx.db, {
      inquiryId: input.inquiryId,
      actorUserId: ctx.userId,
      isAdmin: ctx.isAdmin,
      requestedStart: input.start,
      requestedEnd: input.end,
      notifyTenant: true,
      guardDoubleBook: true,
    });
    if (!result.ok) throw new Error(result.error);
    return { reply: `Tour confirmed for ${result.message}. The guest has been notified.` };
  },
});
