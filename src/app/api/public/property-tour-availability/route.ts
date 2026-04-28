import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type ScheduleRecordRow = {
  id: string | null;
  manager_user_id: string | null;
  property_id: string | null;
  record_type: string | null;
  row_data: unknown;
};

type PropertyManagerEntry = {
  userId: string;
  label: string;
};

function safePropertyId(propertyId: string): string {
  return propertyId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

function payloadSlots(rowData: unknown): string[] {
  if (!rowData || typeof rowData !== "object" || Array.isArray(rowData)) return [];
  const payload = (rowData as Record<string, unknown>).payload;
  return Array.isArray(payload) ? payload.filter((item): item is string => typeof item === "string") : [];
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get("propertyId")?.trim();
    if (!propertyId) return NextResponse.json({ error: "propertyId required" }, { status: 400 });

    const safeId = safePropertyId(propertyId);
    const db = createSupabaseServiceRoleClient();
    const { data, error } = await db
      .from("portal_schedule_records")
      .select("id, manager_user_id, property_id, record_type, row_data")
      .eq("record_type", "manager_property_availability")
      .or(`property_id.eq.${propertyId},property_id.eq.${safeId},id.like.%_prop_${safeId}`);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []) as ScheduleRecordRow[];
    const managerIds = [...new Set(rows.map((row) => row.manager_user_id).filter((id): id is string => Boolean(id)))];
    const labelByManagerId = new Map<string, string>();
    if (managerIds.length > 0) {
      const { data: profiles } = await db.from("profiles").select("id, email, full_name").in("id", managerIds);
      for (const profile of (profiles ?? []) as { id?: string | null; email?: string | null; full_name?: string | null }[]) {
        if (!profile.id) continue;
        labelByManagerId.set(profile.id, profile.email?.trim() || profile.full_name?.trim() || "Property manager");
      }
    }

    const slotHosts: Record<string, PropertyManagerEntry[]> = {};
    for (const row of rows) {
      const managerUserId = row.manager_user_id?.trim();
      if (!managerUserId) continue;
      const host = {
        userId: managerUserId,
        label: labelByManagerId.get(managerUserId) ?? "Property manager",
      };
      for (const slot of payloadSlots(row.row_data)) {
        const hosts = slotHosts[slot] ?? [];
        if (!hosts.some((item) => item.userId === host.userId)) {
          hosts.push(host);
        }
        slotHosts[slot] = hosts;
      }
    }

    return NextResponse.json({ slotHosts });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load property tour availability.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
