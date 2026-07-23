import { z } from "zod";
import { defineTool, defineWriteTool } from "../../registry";
import type { VendorAgentContext } from "../../vendor-context";
import { writeAuditLog, updateAuditResult } from "../../audit";
import { dateSlotKey, vendorAvailabilityStorageKey } from "@/lib/demo-admin-scheduling";
import { managerScheduleRecordIdOwnedByUser } from "@/lib/portal-schedule-record-scope";
import { mergeSlotKeysToDateWindows, minuteOfDayToTimeInputValue } from "@/lib/vendor-availability";

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * Read the vendor's drag-painted slot record. The record id is DERIVED from
 * ctx.userId (axis_vendor_avail_slots_v2_{uid}), so it can never reference
 * another vendor — same key scheme the vendor calendar and
 * resolveVendorNextAvailableSlot use.
 */
async function readOwnSlotRecord(
  ctx: VendorAgentContext,
): Promise<{ storageKey: string; rowData: Record<string, unknown> | null; slots: Set<string> }> {
  const storageKey = vendorAvailabilityStorageKey(ctx.userId);
  const { data, error } = await ctx.db
    .from("portal_schedule_records")
    .select("row_data")
    .eq("id", storageKey)
    .limit(1);
  if (error) throw new Error(error.message);
  const rowData = asObject(((data ?? []) as { row_data: unknown }[])[0]?.row_data);
  // Payload may be nested under `payload` or be the row_data itself (legacy).
  const payload = rowData && "payload" in rowData ? rowData.payload : rowData;
  const slots = new Set(
    Array.isArray(payload) ? payload.filter((item): item is string => typeof item === "string") : [],
  );
  return { storageKey, rowData, slots };
}

export const getMyAvailabilityTool = defineTool({
  name: "get_my_availability",
  description:
    "Read your own open-availability calendar (the drag-painted slots managers use to auto-schedule your visits), grouped into time windows per date. Use before update_my_availability to see what is already open.",
  kind: "read",
  inputSchema: z.object({}).strict(),
  handler: async (ctx: VendorAgentContext) => {
    const { slots } = await readOwnSlotRecord(ctx);
    const windowsByDate = mergeSlotKeysToDateWindows(slots);
    const dates = [...windowsByDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, windows]) => ({
        date,
        windows: windows.map((w) => ({
          start: minuteOfDayToTimeInputValue(w.start),
          end: minuteOfDayToTimeInputValue(w.end),
        })),
      }));
    return { slotCount: slots.size, dates };
  },
});

/* ------------------------------------------------------------------------ */
/* update_my_availability                                                   */
/* ------------------------------------------------------------------------ */

/** "HH:MM" → minutes since midnight; "24:00" allowed as an end-of-day bound. */
function parseClockMinutes(value: string): number | null {
  if (value === "24:00") return 24 * 60;
  const m = value.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function isValidDateStr(date: string): boolean {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}

/** Minutes since midnight → "7:00 AM" style label (timezone-free). */
function formatClock(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const mm = String(minutes % 60).padStart(2, "0");
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm} ${h24 < 12 ? "AM" : "PM"}`;
}

type AvailabilityInput = { date: string; startTime: string; endTime: string; mode: "add" | "remove" };

type AvailabilityScope = { storageKey: string; slotKeys: string[]; windowLabel: string };

/** Shared preview/execute validation; the storage key is self-derived from ctx.userId. */
function resolveAvailabilityScope(
  ctx: VendorAgentContext,
  input: AvailabilityInput,
): { ok: true; scope: AvailabilityScope } | { ok: false; error: string } {
  if (!isValidDateStr(input.date)) {
    return { ok: false, error: `Invalid date "${input.date}" — expected a real calendar date as YYYY-MM-DD.` };
  }
  const startMinutes = parseClockMinutes(input.startTime);
  const endMinutes = parseClockMinutes(input.endTime);
  if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) {
    return { ok: false, error: "Invalid time window — startTime/endTime must be HH:MM with endTime after startTime." };
  }

  const storageKey = vendorAvailabilityStorageKey(ctx.userId);
  // Defense in depth: the key embeds ctx.userId, and the shared schedule-record
  // validator agrees it is this vendor's own record.
  if (!managerScheduleRecordIdOwnedByUser(storageKey, ctx.userId, "vendor_availability")) {
    return { ok: false, error: "Availability record is not owned by this vendor." };
  }

  // Half-hour slots covering [startTime, endTime): 8:00 => slot 16.
  const firstSlot = Math.floor(startMinutes / 30);
  const lastSlotExclusive = Math.ceil(endMinutes / 30);
  const slotKeys: string[] = [];
  for (let slot = firstSlot; slot < lastSlotExclusive; slot += 1) slotKeys.push(dateSlotKey(input.date, slot));

  return {
    ok: true,
    scope: { storageKey, slotKeys, windowLabel: `${formatClock(startMinutes)} – ${formatClock(endMinutes)}` },
  };
}

export const updateMyAvailabilityTool = defineWriteTool({
  name: "update_my_availability",
  description:
    "Open or close your availability slots for one date and time window — managers auto-schedule work-order visits into your open slots. Times are half-hour aligned; the window covers [startTime, endTime).",
  kind: "write",
  inputSchema: z
    .object({
      date: z.string().describe("Calendar date to change, as YYYY-MM-DD."),
      startTime: z.string().describe("Window start as HH:MM 24-hour time, e.g. '08:00'."),
      endTime: z.string().describe("Window end as HH:MM 24-hour time (exclusive), e.g. '12:00'."),
      mode: z.enum(["add", "remove"]).describe("add opens the slots for visits; remove closes them."),
    })
    .strict(),
  preview: async (ctx: VendorAgentContext, input) => {
    const resolved = resolveAvailabilityScope(ctx, input);
    if (!resolved.ok) return resolved;
    const slotCount = resolved.scope.slotKeys.length;
    return {
      ok: true,
      input,
      preview: {
        title: input.mode === "add" ? "Open availability" : "Close availability",
        summary: `${input.mode === "add" ? "Open" : "Close"} ${slotCount} half-hour slot${slotCount === 1 ? "" : "s"} on ${input.date}, ${resolved.scope.windowLabel}.`,
        lines: [
          { label: "Date", value: input.date },
          { label: "Time", value: resolved.scope.windowLabel },
          { label: "Slots", value: `${slotCount} half-hour slot${slotCount === 1 ? "" : "s"}` },
        ],
        confirmLabel: input.mode === "add" ? "Open slots" : "Close slots",
      },
    };
  },
  execute: async (ctx: VendorAgentContext, input) => {
    const resolved = resolveAvailabilityScope(ctx, input);
    if (!resolved.ok) return resolved;
    const { scope } = resolved;

    const dedupeKey = `update_my_availability:${ctx.landlordId}:${input.date}:${input.mode}:${input.startTime}-${input.endTime}`;
    const audit = await writeAuditLog(ctx, {
      action: "update_my_availability",
      toolName: "update_my_availability",
      inputSummary: { date: input.date, startTime: input.startTime, endTime: input.endTime, mode: input.mode },
      dedupeKey,
    });
    if (!audit.recorded) {
      if (audit.duplicate) {
        return { ok: true, reply: `Already done — that ${input.mode === "add" ? "availability" : "removal"} was applied for ${input.date}, ${scope.windowLabel}.` };
      }
      return { ok: false, error: "Could not record the action; availability was not changed." };
    }

    // Read-merge-write the current slot set (never construct from scratch).
    const { rowData, slots } = await readOwnSlotRecord(ctx);
    let changed = 0;
    for (const key of scope.slotKeys) {
      if (input.mode === "add") {
        if (!slots.has(key)) {
          slots.add(key);
          changed += 1;
        }
      } else if (slots.delete(key)) {
        changed += 1;
      }
    }

    // Same row shape the vendor calendar sync and flexible-preferences writer
    // use: the record's manager_user_id column carries the vendor's own uid.
    const { error: writeError } = await ctx.db.from("portal_schedule_records").upsert(
      {
        id: scope.storageKey,
        manager_user_id: ctx.userId,
        property_id: null,
        record_type: "vendor_availability",
        row_data: {
          ...(rowData ?? {}),
          id: scope.storageKey,
          recordType: "vendor_availability",
          managerUserId: ctx.userId,
          payload: [...slots].sort(),
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (writeError) {
      await updateAuditResult(ctx, dedupeKey, { error: "write_failed" }, { clearDedupeKey: true });
      return { ok: false, error: String(writeError.message ?? "Could not save availability.") };
    }

    await updateAuditResult(ctx, dedupeKey, { changed, totalSlots: slots.size });
    const already = scope.slotKeys.length - changed;
    const verb = input.mode === "add" ? "Opened" : "Closed";
    const alreadyNote = already > 0 ? ` (${already} slot${already === 1 ? " was" : "s were"} already ${input.mode === "add" ? "open" : "closed"})` : "";
    return {
      ok: true,
      reply: `${verb} ${changed} half-hour slot${changed === 1 ? "" : "s"} on ${input.date}, ${scope.windowLabel}${alreadyNote}.`,
      resultSummary: { changed, totalSlots: slots.size },
    };
  },
});
