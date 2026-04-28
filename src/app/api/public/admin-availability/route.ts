import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const PRIMARY_ADMIN_EMAIL = "prakritramachandran@gmail.com";

type AdminAvailabilityHost = {
  adminUserId: string;
  adminLabel: string;
};

type ScheduleRecordRow = {
  id: string | null;
  manager_user_id: string | null;
  record_type: string | null;
  row_data: unknown;
};

function slotRowsFromPayload(payload: unknown): string[] {
  return Array.isArray(payload) ? payload.filter((item): item is string => typeof item === "string") : [];
}

function adminIdFromRecord(id: string, managerUserId: unknown): string {
  if (typeof managerUserId === "string" && managerUserId.trim()) return managerUserId.trim();
  const match = id.match(/^axis_admin_avail_slots_v2_admin_(.+)$/);
  return match?.[1]?.trim() || "";
}

export async function GET() {
  try {
    const db = createSupabaseServiceRoleClient();
    const { data, error } = await db
      .from("portal_schedule_records")
      .select("id, manager_user_id, record_type, row_data")
      .eq("record_type", "admin_availability");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const adminIds = [
      ...new Set(
        ((data ?? []) as ScheduleRecordRow[])
          .map((record) => adminIdFromRecord(String(record.id ?? ""), record.manager_user_id))
          .filter(Boolean),
      ),
    ];
    const emailByAdminId = new Map<string, string>();
    if (adminIds.length > 0) {
      const { data: profiles } = await db.from("profiles").select("id, email").in("id", adminIds);
      for (const profile of (profiles ?? []) as { id?: string | null; email?: string | null }[]) {
        if (profile.id && profile.email) emailByAdminId.set(profile.id, profile.email.trim().toLowerCase());
      }
    }

    const slotHosts: Record<string, AdminAvailabilityHost[]> = {};
    for (const record of ((data ?? []) as ScheduleRecordRow[])) {
      const rowData = record.row_data && typeof record.row_data === "object" ? record.row_data as Record<string, unknown> : {};
      const slots = slotRowsFromPayload(rowData.payload);
      const adminUserId = adminIdFromRecord(String(record.id ?? ""), record.manager_user_id);
      if (!adminUserId) continue;
      const storedLabel = typeof rowData.adminLabel === "string" ? rowData.adminLabel.trim().toLowerCase() : "";
      const profileEmail = emailByAdminId.get(adminUserId) ?? "";
      if (storedLabel !== PRIMARY_ADMIN_EMAIL && profileEmail !== PRIMARY_ADMIN_EMAIL) continue;
      const adminLabel = PRIMARY_ADMIN_EMAIL;

      for (const slot of slots) {
        const hosts = slotHosts[slot] ?? [];
        if (!hosts.some((host) => host.adminUserId === adminUserId)) {
          hosts.push({ adminUserId, adminLabel });
        }
        slotHosts[slot] = hosts;
      }
    }

    return NextResponse.json({ slotHosts });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load admin availability.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
