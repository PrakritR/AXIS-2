import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const INQUIRIES_RECORD_ID = "axis_admin_partner_inquiries_v1";

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

    const { error: writeError } = await db.from("portal_schedule_records").upsert(
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
      { onConflict: "id" },
    );

    if (writeError) return NextResponse.json({ error: writeError.message }, { status: 500 });
    return NextResponse.json({ ok: true, row });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save inquiry.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
