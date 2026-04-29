import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const INQUIRIES_RECORD_ID = "axis_admin_partner_inquiries_v1";
const PLANNED_RECORD_ID = "axis_admin_planned_events_v1";
const INQUIRY_EVENT_RECORD_TYPE = "partner_inquiry_request";

type PartnerInquiryRow = {
  id?: unknown;
  status?: unknown;
  createdAt?: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function inquiryRowsFromRecord(rowData: unknown): Record<string, unknown>[] {
  if (!isObject(rowData)) return [];
  const payload = rowData.payload;
  return Array.isArray(payload) ? payload.filter(isObject) : [];
}

type RequestedWindow = { start: string; end: string; adminUserId?: string; slotKey?: string };

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requestedWindowsFromRow(row: Record<string, unknown>): RequestedWindow[] {
  const windows = Array.isArray(row.requestedWindows) ? row.requestedWindows : [];
  const normalized = windows
    .filter(isObject)
    .map((window) => ({
      start: typeof window.start === "string" ? window.start : "",
      end: typeof window.end === "string" ? window.end : "",
      adminUserId: typeof window.adminUserId === "string" ? window.adminUserId : undefined,
      slotKey: typeof window.slotKey === "string" ? window.slotKey : undefined,
    }))
    .filter((window) => window.start && window.end);
  if (normalized.length > 0) return normalized;
  return typeof row.proposedStart === "string" && typeof row.proposedEnd === "string"
    ? [{
      start: row.proposedStart,
      end: row.proposedEnd,
      adminUserId: typeof row.adminUserId === "string" ? row.adminUserId : undefined,
      slotKey: typeof row.slotKey === "string" ? row.slotKey : undefined,
    }]
    : [];
}

function payloadFromScheduleRecord(rowData: unknown): Record<string, unknown> | null {
  const record = isObject(rowData) ? rowData : null;
  if (!record) return null;
  return isObject(record.payload) ? record.payload : record;
}

function slotKeysFromInquiryPayload(payload: Record<string, unknown>): Set<string> {
  const keys = new Set<string>();
  const rowSlotKey = textValue(payload.slotKey);
  if (rowSlotKey) keys.add(rowSlotKey);
  for (const window of requestedWindowsFromRow(payload)) {
    if (window.slotKey) keys.add(window.slotKey);
  }
  return keys;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const a0 = new Date(aStart).getTime();
  const a1 = new Date(aEnd).getTime();
  const b0 = new Date(bStart).getTime();
  const b1 = new Date(bEnd).getTime();
  if (![a0, a1, b0, b1].every(Number.isFinite)) return false;
  return a0 < b1 && b0 < a1;
}

async function hasManagerTourConflict(
  db: ReturnType<typeof createSupabaseServiceRoleClient>,
  managerUserId: string,
  incomingWindows: RequestedWindow[],
): Promise<boolean> {
  const incomingSlotKeys = new Set(incomingWindows.map((window) => window.slotKey).filter((key): key is string => Boolean(key)));
  const { data: pendingRows, error: pendingError } = await db
    .from("portal_schedule_records")
    .select("starts_at, ends_at, row_data")
    .eq("record_type", INQUIRY_EVENT_RECORD_TYPE)
    .eq("manager_user_id", managerUserId);

  if (pendingError) throw pendingError;

  for (const pending of (pendingRows ?? []) as { starts_at?: string | null; ends_at?: string | null; row_data?: unknown }[]) {
    const payload = payloadFromScheduleRecord(pending.row_data);
    if (payload && textValue(payload.status).toLowerCase() !== "pending") continue;
    const pendingSlotKeys = payload ? slotKeysFromInquiryPayload(payload) : new Set<string>();
    if (incomingSlotKeys.size > 0 && [...incomingSlotKeys].some((slotKey) => pendingSlotKeys.has(slotKey))) return true;
    if (pending.starts_at && pending.ends_at && incomingWindows.some((window) => overlaps(window.start, window.end, pending.starts_at!, pending.ends_at!))) {
      return true;
    }
  }

  const { data: plannedRow, error: plannedError } = await db
    .from("portal_schedule_records")
    .select("row_data")
    .eq("id", PLANNED_RECORD_ID)
    .maybeSingle();

  if (plannedError) throw plannedError;

  const plannedPayload = isObject(plannedRow?.row_data) ? plannedRow.row_data.payload : null;
  const plannedEvents = Array.isArray(plannedPayload) ? plannedPayload.filter(isObject) : [];
  for (const event of plannedEvents) {
    if (textValue(event.kind) !== "tour") continue;
    if (textValue(event.managerUserId) !== managerUserId) continue;
    const plannedSlotKey = textValue(event.slotKey);
    if (plannedSlotKey && incomingSlotKeys.has(plannedSlotKey)) return true;
    const start = textValue(event.start);
    const end = textValue(event.end);
    if (start && end && incomingWindows.some((window) => overlaps(window.start, window.end, start, end))) return true;
  }

  return false;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { row?: unknown };
    if (!isObject(body.row)) {
      return NextResponse.json({ error: "row required" }, { status: 400 });
    }

    const incoming = body.row as Record<string, unknown> & PartnerInquiryRow;
    const id = typeof incoming.id === "string" && incoming.id.trim() ? incoming.id.trim() : crypto.randomUUID();
    const row: Record<string, unknown> = {
      ...incoming,
      id,
      status: typeof incoming.status === "string" && incoming.status.trim() ? incoming.status : "pending",
      createdAt:
        typeof incoming.createdAt === "string" && incoming.createdAt.trim()
          ? incoming.createdAt
          : new Date().toISOString(),
    };
    const propertyId = typeof row["propertyId"] === "string" ? row["propertyId"] : null;
    const proposedStart = typeof row["proposedStart"] === "string" ? row["proposedStart"] : null;
    const proposedEnd = typeof row["proposedEnd"] === "string" ? row["proposedEnd"] : null;
    const requestedWindows = requestedWindowsFromRow(row);

    const db = createSupabaseServiceRoleClient();
    if (textValue(row.kind) === "tour") {
      for (const window of requestedWindows) {
        const managerUserId = textValue(row.managerUserId) || textValue(window.adminUserId);
        if (!managerUserId) continue;
        if (await hasManagerTourConflict(db, managerUserId, [window])) {
          return NextResponse.json(
            { error: "That manager already has a tour at this time. Please choose another time." },
            { status: 409 },
          );
        }
      }
    }

    const { data, error: readError } = await db
      .from("portal_schedule_records")
      .select("row_data")
      .eq("id", INQUIRIES_RECORD_ID)
      .maybeSingle();

    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

    const existing = inquiryRowsFromRecord(data?.row_data);
    const next = [row, ...existing.filter((item) => item.id !== id)];

    const records: Record<string, unknown>[] = [
      {
        id: INQUIRIES_RECORD_ID,
        manager_user_id: null,
        property_id: propertyId,
        record_type: INQUIRIES_RECORD_ID,
        starts_at: proposedStart,
        ends_at: proposedEnd,
        row_data: {
          id: INQUIRIES_RECORD_ID,
          recordType: INQUIRIES_RECORD_ID,
          managerUserId: null,
          propertyId: null,
          payload: next,
        },
        updated_at: new Date().toISOString(),
      },
    ];

    requestedWindows.forEach((window, index) => {
      const managerUserId =
        typeof row.managerUserId === "string" && row.managerUserId.trim()
          ? row.managerUserId
          : window.adminUserId;
      records.push({
        id: `${INQUIRY_EVENT_RECORD_TYPE}_${id}_${index}`,
        manager_user_id: managerUserId || null,
        property_id: propertyId,
        record_type: INQUIRY_EVENT_RECORD_TYPE,
        starts_at: window.start,
        ends_at: window.end,
        row_data: {
          id: `${INQUIRY_EVENT_RECORD_TYPE}_${id}_${index}`,
          recordType: INQUIRY_EVENT_RECORD_TYPE,
          managerUserId: managerUserId || null,
          propertyId,
          payload: row,
        },
        updated_at: new Date().toISOString(),
      });
    });

    const { error: writeError } = await db.from("portal_schedule_records").upsert(records, { onConflict: "id" });

    if (writeError) {
      if ("code" in writeError && writeError.code === "23505") {
        return NextResponse.json(
          { error: "That manager already has a tour at this time. Please choose another time." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: writeError.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, row });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save inquiry.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
