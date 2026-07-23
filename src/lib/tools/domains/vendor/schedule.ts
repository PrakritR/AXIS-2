import { z } from "zod";
import { defineTool } from "../../registry";
import type { VendorAgentContext } from "../../vendor-context";

export const listMyScheduleTool = defineTool({
  name: "list_my_schedule",
  description:
    "List the signed-in vendor's own calendar entries (site visits, job appointments, and work events they created) with title, date/time, and property. Use for 'what's on my calendar', 'when is my next visit'.",
  inputSchema: z
    .object({
      from: z.string().optional().describe("Optional ISO date (YYYY-MM-DD) lower bound."),
      to: z.string().optional().describe("Optional ISO date (YYYY-MM-DD) upper bound."),
    })
    .strict(),
  handler: async (ctx: VendorAgentContext, input) => {
    const { data, error } = await ctx.db
      .from("portal_schedule_records")
      .select("id, row_data")
      .eq("owner_user_id", ctx.userId)
      .order("id", { ascending: true })
      .limit(1000);
    if (error) throw new Error(error.message);
    const events = ((data ?? []) as { row_data: unknown }[])
      .map((r) => (r.row_data ?? {}) as Record<string, unknown>)
      .map((e) => ({
        id: String(e.id ?? "") || null,
        title: String(e.title ?? e.label ?? "") || null,
        date: String(e.date ?? e.startDate ?? "") || null,
        start: String(e.start ?? e.startTime ?? "") || null,
        end: String(e.end ?? e.endTime ?? "") || null,
        property: String(e.propertyName ?? e.property ?? "") || null,
        kind: String(e.kind ?? e.type ?? "") || null,
      }))
      .filter((e) => {
        if (input.from && e.date && e.date < input.from) return false;
        if (input.to && e.date && e.date > input.to) return false;
        return true;
      });
    return { count: events.length, events };
  },
});
