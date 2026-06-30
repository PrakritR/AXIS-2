import { z } from "zod";
import { defineTool } from "../registry";
import { loadScheduledInboxMessagesForManager } from "@/lib/scheduled-inbox-messages";

type RawScheduleRecord = {
  id: string;
  record_type: string | null;
  starts_at: string | null;
  ends_at: string | null;
  row_data: unknown;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function str(obj: Record<string, unknown> | null, key: string): string | null {
  const v = obj?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function summarizeEvent(rec: RawScheduleRecord) {
  const row = asObject(rec.row_data);
  return {
    id: rec.id,
    type: rec.record_type || null,
    startsAt: rec.starts_at || null,
    endsAt: rec.ends_at || null,
    title: str(row, "title") ?? str(row, "label") ?? str(row, "summary"),
    notes: str(row, "notes"),
  };
}

export const listCalendarEventsTool = defineTool({
  name: "list_calendar_events",
  description:
    "List the current landlord's calendar entries (events, availability, tours) with type, start/end time, and title. Optionally filter by an ISO datetime window. Use for 'what's on my calendar', 'do I have tours this week', etc.",
  kind: "read",
  inputSchema: z
    .object({
      from: z.string().optional().describe("Optional ISO datetime lower bound on start time."),
      to: z.string().optional().describe("Optional ISO datetime upper bound on start time."),
    })
    .strict(),
  handler: async (ctx, input) => {
    let query = ctx.db
      .from("portal_schedule_records")
      .select("id, record_type, starts_at, ends_at, row_data")
      .eq("manager_user_id", ctx.landlordId)
      .order("starts_at", { ascending: true })
      .limit(1000);
    if (input.from) query = query.gte("starts_at", input.from);
    if (input.to) query = query.lte("starts_at", input.to);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const events = ((data ?? []) as RawScheduleRecord[]).map(summarizeEvent);
    return { count: events.length, events };
  },
});

export const listScheduledMessagesTool = defineTool({
  name: "list_scheduled_messages",
  description:
    "List the current landlord's scheduled outbound messages (send time, status, subject, recipient). Optionally filter by status (scheduled/sent/cancelled). Use for 'what messages are scheduled to go out'. Message bodies are not returned.",
  kind: "read",
  inputSchema: z
    .object({
      status: z
        .enum(["scheduled", "sent", "cancelled"])
        .optional()
        .describe("Optional status filter."),
    })
    .strict(),
  handler: async (ctx, input) => {
    const rows = await loadScheduledInboxMessagesForManager(ctx.db, ctx.landlordId);
    const filtered = rows
      .filter((m) => !input.status || m.status === input.status)
      .map((m) => ({
        id: m.id,
        sendAt: m.sendAt,
        status: m.status,
        subject: m.subject || null,
        recipientName: m.recipientName || null,
        recipientEmail: (m.recipientEmail || "").trim().toLowerCase() || null,
      }));
    return { count: filtered.length, messages: filtered };
  },
});
