import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const INQUIRIES_RECORD_ID = "axis_admin_partner_inquiries_v1";
const PLANNED_RECORD_ID = "axis_admin_planned_events_v1";
const INQUIRY_EVENT_RECORD_TYPE = "partner_inquiry_request";

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function textField(row: Record<string, unknown> | null | undefined, key: string): string {
  const value = row?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function rowsFromRecord(rowData: unknown): Record<string, unknown>[] {
  const payload = asObject(rowData)?.payload;
  return Array.isArray(payload) ? payload.filter((item): item is Record<string, unknown> => Boolean(asObject(item))) : [];
}

function windowsFromInquiry(row: Record<string, unknown>): { start: string; end: string; managerUserId: string; adminLabel?: string }[] {
  const requested = Array.isArray(row.requestedWindows) ? row.requestedWindows : [];
  const windows = requested
    .map(asObject)
    .filter((window): window is Record<string, unknown> => Boolean(window))
    .map((window) => ({
      start: textField(window, "start"),
      end: textField(window, "end"),
      managerUserId: textField(row, "managerUserId") || textField(window, "adminUserId"),
      adminLabel: textField(window, "adminLabel") || undefined,
    }))
    .filter((window) => window.start && window.end && window.managerUserId);
  if (windows.length > 0) return windows;

  const start = textField(row, "proposedStart");
  const end = textField(row, "proposedEnd");
  const managerUserId = textField(row, "managerUserId") || textField(row, "adminUserId");
  return start && end && managerUserId
    ? [{ start, end, managerUserId, adminLabel: textField(row, "adminLabel") || undefined }]
    : [];
}

function sameInstant(a: string | null | undefined, b: string): boolean {
  if (!a || !b) return false;
  const aMs = new Date(a).getTime();
  const bMs = new Date(b).getTime();
  return Number.isFinite(aMs) && Number.isFinite(bMs) && aMs === bMs;
}

function sameTourSlot(row: Record<string, unknown>, managerUserId: string, start: string, end: string): boolean {
  if (textField(row, "kind") !== "tour") return false;
  return windowsFromInquiry(row).some(
    (window) => window.managerUserId === managerUserId && sameInstant(window.start, start) && sameInstant(window.end, end),
  );
}

function formatRangeLabel(isoStart: string, isoEnd: string): string {
  const start = new Date(isoStart);
  const end = new Date(isoEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Tour time";
  return `${start.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })} - ${end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

export async function POST(req: Request) {
  try {
    const auth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const body = (await req.json()) as { id?: unknown; start?: unknown; end?: unknown; instructions?: unknown };
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const requestedStart = typeof body.start === "string" ? body.start.trim() : "";
    const requestedEnd = typeof body.end === "string" ? body.end.trim() : "";
    const instructions = typeof body.instructions === "string" ? body.instructions.trim() : "";
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const admin = await isAdminUser(user.id);
    const db = createSupabaseServiceRoleClient();
    const { data: inquiryRecord, error: inquiryError } = await db
      .from("portal_schedule_records")
      .select("row_data")
      .eq("id", INQUIRIES_RECORD_ID)
      .maybeSingle();
    if (inquiryError) return NextResponse.json({ error: inquiryError.message }, { status: 500 });

    const inquiries = rowsFromRecord(inquiryRecord?.row_data);
    const row = inquiries.find((item) => textField(item, "id") === id);
    if (!row || textField(row, "kind") !== "tour" || textField(row, "status") !== "pending") {
      return NextResponse.json({ error: "Tour request not found." }, { status: 404 });
    }

    const managerUserId = textField(row, "managerUserId");
    if (!managerUserId || (!admin && managerUserId !== user.id)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
    }

    const selectedWindow =
      windowsFromInquiry(row).find((window) => sameInstant(window.start, requestedStart) && sameInstant(window.end, requestedEnd)) ??
      windowsFromInquiry(row)[0];
    if (!selectedWindow) return NextResponse.json({ error: "Tour window not found." }, { status: 400 });

    const groupId = textField(row, "tourGroupId");
    const start = selectedWindow.start;
    const end = selectedWindow.end;
    const plannedEvent = {
      id: crypto.randomUUID(),
      title: `Tour · ${textField(row, "name") || "Guest"}`,
      start,
      end,
      sourceInquiryId: id,
      kind: "tour",
      managerUserId,
      tourGroupId: groupId || undefined,
      propertyId: textField(row, "propertyId") || undefined,
      propertyTitle: textField(row, "propertyTitle") || undefined,
      roomLabel: textField(row, "roomLabel") || undefined,
      adminUserId: managerUserId,
      adminLabel: selectedWindow.adminLabel ?? (textField(row, "adminLabel") || undefined),
      attendeeName: textField(row, "name") || undefined,
      attendeeEmail: textField(row, "email") || undefined,
      attendeePhone: textField(row, "phone") || undefined,
      notes: textField(row, "notes") || undefined,
      instructions: instructions || undefined,
    };

    const nextInquiries = inquiries.filter((candidate) => {
      if (textField(candidate, "id") === id) return false;
      if (groupId && textField(candidate, "tourGroupId") === groupId) return false;
      return !sameTourSlot(candidate, managerUserId, start, end);
    });

    const { data: plannedRecord, error: plannedReadError } = await db
      .from("portal_schedule_records")
      .select("row_data")
      .eq("id", PLANNED_RECORD_ID)
      .maybeSingle();
    if (plannedReadError) return NextResponse.json({ error: plannedReadError.message }, { status: 500 });
    const plannedRows = rowsFromRecord(plannedRecord?.row_data);

    const { error: writeError } = await db.from("portal_schedule_records").upsert(
      [
        {
          id: INQUIRIES_RECORD_ID,
          manager_user_id: null,
          property_id: null,
          record_type: INQUIRIES_RECORD_ID,
          row_data: {
            id: INQUIRIES_RECORD_ID,
            recordType: INQUIRIES_RECORD_ID,
            managerUserId: null,
            propertyId: null,
            payload: nextInquiries,
          },
          updated_at: new Date().toISOString(),
        },
        {
          id: PLANNED_RECORD_ID,
          manager_user_id: null,
          property_id: textField(row, "propertyId") || null,
          record_type: PLANNED_RECORD_ID,
          starts_at: start,
          ends_at: end,
          row_data: {
            id: PLANNED_RECORD_ID,
            recordType: PLANNED_RECORD_ID,
            managerUserId: null,
            propertyId: null,
            payload: [...plannedRows, plannedEvent],
          },
          updated_at: new Date().toISOString(),
        },
      ],
      { onConflict: "id" },
    );
    if (writeError) return NextResponse.json({ error: writeError.message }, { status: 500 });

    const eventIds = inquiries
      .filter((candidate) => {
        if (textField(candidate, "id") === id) return true;
        if (groupId && textField(candidate, "tourGroupId") === groupId) return true;
        return sameTourSlot(candidate, managerUserId, start, end);
      })
      .map((candidate) => `${INQUIRY_EVENT_RECORD_TYPE}_${textField(candidate, "id")}_0`)
      .filter(Boolean);
    if (eventIds.length > 0) {
      const { error: deleteError } = await db.from("portal_schedule_records").delete().in("id", eventIds);
      if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, plannedEvent, message: formatRangeLabel(start, end) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to approve tour request.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
