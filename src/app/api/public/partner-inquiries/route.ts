import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const INQUIRIES_RECORD_ID = "axis_admin_partner_inquiries_v1";
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

function requestedWindowsFromRow(row: Record<string, unknown>): { start: string; end: string; adminUserId?: string }[] {
  const windows = Array.isArray(row.requestedWindows) ? row.requestedWindows : [];
  const normalized = windows
    .filter(isObject)
    .map((window) => ({
      start: typeof window.start === "string" ? window.start : "",
      end: typeof window.end === "string" ? window.end : "",
      adminUserId: typeof window.adminUserId === "string" ? window.adminUserId : undefined,
    }))
    .filter((window) => window.start && window.end);
  if (normalized.length > 0) return normalized;
  return typeof row.proposedStart === "string" && typeof row.proposedEnd === "string"
    ? [{ start: row.proposedStart, end: row.proposedEnd, adminUserId: typeof row.adminUserId === "string" ? row.adminUserId : undefined }]
    : [];
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

    const db = createSupabaseServiceRoleClient();
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

    requestedWindowsFromRow(row).forEach((window, index) => {
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

    if (writeError) return NextResponse.json({ error: writeError.message }, { status: 500 });
    return NextResponse.json({ ok: true, row });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save inquiry.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
