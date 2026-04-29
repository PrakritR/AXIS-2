import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const PRIMARY_ADMIN_EMAIL = "prakritramachandran@gmail.com";
const PLANNED_RECORD_ID = "axis_admin_planned_events_v1";

type AdminAvailabilityHost = {
  adminUserId: string;
  adminLabel: string;
};

type ScheduleRecordRow = {
  id: string | null;
  manager_user_id: string | null;
  record_type: string | null;
  row_data: unknown;
  starts_at?: string | null;
  ends_at?: string | null;
};

function slotRowsFromPayload(payload: unknown): string[] {
  return Array.isArray(payload) ? payload.filter((item): item is string => typeof item === "string") : [];
}

function adminIdFromRecord(id: string, managerUserId: unknown): string {
  if (typeof managerUserId === "string" && managerUserId.trim()) return managerUserId.trim();
  const match = id.match(/^axis_admin_avail_slots_v2_admin_(.+)$/);
  return match?.[1]?.trim() || "";
}

function slotStartMs(slot: string): number | null {
  const [dateStr, rawIdx] = slot.split(":");
  const idx = Number.parseInt(rawIdx ?? "", 10);
  if (!dateStr || !Number.isFinite(idx) || idx < 0 || idx >= 48) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  start.setMinutes(idx * 30);
  return start.getTime();
}

function slotIsBookable(slot: string): boolean {
  const ms = slotStartMs(slot);
  return ms !== null && ms >= Date.now();
}

function slotOverlaps(slot: string, startIso: string, endIso: string): boolean {
  const slotMs = slotStartMs(slot);
  if (slotMs === null) return false;
  const slotEnd = slotMs + 30 * 60 * 1000;
  const blockStart = new Date(startIso).getTime();
  const blockEnd = new Date(endIso).getTime();
  if (![blockStart, blockEnd].every(Number.isFinite)) return false;
  return slotMs < blockEnd && blockStart < slotEnd;
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

    // Build blocked time ranges per admin from pending inquiries + confirmed events.
    const blockedByAdmin = new Map<string, { start: string; end: string }[]>();
    if (adminIds.length > 0) {
      const { data: pendingRows } = await db
        .from("portal_schedule_records")
        .select("manager_user_id, starts_at, ends_at, row_data")
        .eq("record_type", "partner_inquiry_request")
        .in("manager_user_id", adminIds);

      for (const row of (pendingRows ?? []) as ScheduleRecordRow[]) {
        const adminUserId = row.manager_user_id?.trim();
        if (!adminUserId || !row.starts_at || !row.ends_at) continue;
        const payload = row.row_data && typeof row.row_data === "object" && !Array.isArray(row.row_data)
          ? (row.row_data as Record<string, unknown>).payload : null;
        if (payload && typeof payload === "object" && !Array.isArray(payload)) {
          const status = (payload as Record<string, unknown>).status;
          if (typeof status === "string" && status.toLowerCase() !== "pending") continue;
        }
        const blocks = blockedByAdmin.get(adminUserId) ?? [];
        blocks.push({ start: row.starts_at, end: row.ends_at });
        blockedByAdmin.set(adminUserId, blocks);
      }

      const { data: plannedRow } = await db
        .from("portal_schedule_records")
        .select("row_data")
        .eq("id", PLANNED_RECORD_ID)
        .maybeSingle();

      const plannedPayload = plannedRow?.row_data && typeof plannedRow.row_data === "object" && !Array.isArray(plannedRow.row_data)
        ? (plannedRow.row_data as Record<string, unknown>).payload : null;
      const plannedEvents = Array.isArray(plannedPayload) ? plannedPayload : [];
      for (const event of plannedEvents) {
        if (!event || typeof event !== "object" || Array.isArray(event)) continue;
        const ev = event as Record<string, unknown>;
        if (typeof ev.kind === "string" && ev.kind === "tour") continue; // tours handled separately
        const adminUserId = typeof ev.managerUserId === "string" ? ev.managerUserId.trim() : "";
        const start = typeof ev.start === "string" ? ev.start.trim() : "";
        const end = typeof ev.end === "string" ? ev.end.trim() : "";
        if (!adminUserId || !start || !end || !adminIds.includes(adminUserId)) continue;
        const blocks = blockedByAdmin.get(adminUserId) ?? [];
        blocks.push({ start, end });
        blockedByAdmin.set(adminUserId, blocks);
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
      const blocked = blockedByAdmin.get(adminUserId) ?? [];

      for (const slot of slots) {
        if (!slotIsBookable(slot)) continue;
        if (blocked.some((b) => slotOverlaps(slot, b.start, b.end))) continue;
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
