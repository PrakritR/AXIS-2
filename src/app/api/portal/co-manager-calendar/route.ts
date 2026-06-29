import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import {
  calendarShareAvailabilityStorageKey,
  managerPropertyAvailabilityStorageKey,
} from "@/lib/demo-admin-scheduling";

export const runtime = "nodejs";

type ScheduleRecordRow = {
  id: string | null;
  manager_user_id: string | null;
  property_id: string | null;
  record_type: string | null;
  row_data: unknown;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function textField(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value.trim() : "";
}

function payloadFromRowData(rowData: unknown): unknown {
  const row = asObject(rowData);
  if (!row) return null;
  return row.payload ?? row;
}

function readShareAvailability(rowData: unknown): boolean {
  const payload = payloadFromRowData(rowData);
  const obj = asObject(payload);
  return obj?.shareAvailability === true;
}

function readAvailabilitySlots(rowData: unknown): string[] {
  const payload = payloadFromRowData(rowData);
  if (Array.isArray(payload)) return payload.filter((item): item is string => typeof item === "string");
  return [];
}


export async function GET(req: Request) {
  try {
    const auth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const propertyId = new URL(req.url).searchParams.get("propertyId")?.trim();
    if (!propertyId) return NextResponse.json({ error: "propertyId required" }, { status: 400 });

    const db = createSupabaseServiceRoleClient();
    const peers = new Map<string, { label: string; isSelf: boolean }>();
    peers.set(user.id, { label: "You", isSelf: true });

    const { data: propertyRows, error: propertyError } = await db
      .from("manager_property_records")
      .select("manager_user_id, property_data");
    if (propertyError) return NextResponse.json({ error: propertyError.message }, { status: 500 });

    for (const row of propertyRows ?? []) {
      const property = asObject((row as { property_data?: unknown }).property_data);
      if (!property) continue;
      const id = textField(property, "id");
      if (id !== propertyId) continue;
      const ownerId = String((row as { manager_user_id?: string | null }).manager_user_id ?? "").trim();
      if (ownerId) {
        peers.set(ownerId, {
          label: ownerId === user.id ? "You" : "Primary manager",
          isSelf: ownerId === user.id,
        });
      }
    }

    const { data: linkRows, error: linkError } = await db
      .from("account_link_invites")
      .select(
        "inviter_user_id, invitee_user_id, inviter_axis_id, invitee_axis_id, inviter_display_name, invitee_display_name, assigned_property_ids, status",
      )
      .eq("status", "accepted")
      .or(`inviter_user_id.eq.${user.id},invitee_user_id.eq.${user.id}`);

    if (linkError && !String(linkError.message ?? "").toLowerCase().includes("account_link_invites")) {
      return NextResponse.json({ error: linkError.message }, { status: 500 });
    }

    for (const raw of linkRows ?? []) {
      const row = raw as Record<string, unknown>;
      const assigned = Array.isArray(row.assigned_property_ids)
        ? row.assigned_property_ids.filter((item): item is string => typeof item === "string")
        : [];
      if (!assigned.includes(propertyId)) continue;

      const inviterId = textField(row, "inviter_user_id");
      const inviteeId = textField(row, "invitee_user_id");
      if (inviterId) {
        peers.set(inviterId, {
          label: inviterId === user.id ? "You" : textField(row, "inviter_display_name") || textField(row, "inviter_axis_id") || inviterId,
          isSelf: inviterId === user.id,
        });
      }
      if (inviteeId) {
        peers.set(inviteeId, {
          label: inviteeId === user.id ? "You" : textField(row, "invitee_display_name") || textField(row, "invitee_axis_id") || inviteeId,
          isSelf: inviteeId === user.id,
        });
      }
    }

    if (!peers.has(user.id)) {
      return NextResponse.json({ error: "You do not have calendar access to this property." }, { status: 403 });
    }

    const peerIds = [...peers.keys()];
    const recordIds = peerIds.flatMap((peerId) => [
      calendarShareAvailabilityStorageKey(peerId, propertyId),
      managerPropertyAvailabilityStorageKey(peerId, propertyId),
    ]);

    const { data: scheduleRows, error: scheduleError } = await db
      .from("portal_schedule_records")
      .select("id, manager_user_id, property_id, record_type, row_data")
      .in("id", recordIds.length > 0 ? recordIds : ["__none__"]);

    if (scheduleError) return NextResponse.json({ error: scheduleError.message }, { status: 500 });

    const recordsById = new Map<string, ScheduleRecordRow>();
    for (const row of (scheduleRows ?? []) as ScheduleRecordRow[]) {
      if (row.id) recordsById.set(row.id, row);
    }

    const result = peerIds.map((peerId) => {
      const meta = peers.get(peerId)!;
      const shareKey = calendarShareAvailabilityStorageKey(peerId, propertyId);
      const availKey = managerPropertyAvailabilityStorageKey(peerId, propertyId);
      const shareRecord = recordsById.get(shareKey);
      const availRecord = recordsById.get(availKey);
      const sharesAvailability = readShareAvailability(shareRecord?.row_data ?? null);

      let slots: string[] = [];
      if (meta.isSelf || sharesAvailability) {
        slots = readAvailabilitySlots(availRecord?.row_data ?? null);
      }

      return {
        userId: peerId,
        label: meta.label,
        isSelf: meta.isSelf,
        sharesAvailability,
        slots,
      };
    });

    return NextResponse.json({ peers: result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load co-manager calendar.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
