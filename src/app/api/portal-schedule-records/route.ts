import { createJsonRecordRoute } from "@/lib/portal-record-api";
import {
  isManagerScopedScheduleRecordType,
  managerScheduleRecordIdOwnedByUser,
} from "@/lib/portal-schedule-record-scope";

export const runtime = "nodejs";

const route = createJsonRecordRoute({
  table: "portal_schedule_records",
  scope: (query, user) => {
    const q = query as {
      eq: (column: string, value: string) => unknown;
      or: (filters: string) => unknown;
    };
    if (user.role === "admin") return query;
    if (user.role === "vendor") {
      return q.or(
        `manager_user_id.eq.${user.id},id.eq.axis_vendor_avail_slots_v2_${user.id},id.eq.axis_vendor_flex_prefs_${user.id}`,
      );
    }
    return q.or(
      `manager_user_id.eq.${user.id},id.like.axis_mgr_avail_slots_v2_${user.id}%,id.like.axis_calendar_share_avail_${user.id}_prop_%,id.eq.axis_admin_partner_inquiries_v1,id.eq.axis_admin_planned_events_v1`,
    );
  },
  buildUpsert: (row, user) => {
    const recordType = String(row.recordType ?? row.record_type ?? "event");
    const managerScoped = isManagerScopedScheduleRecordType(recordType);
    return {
      id: row.id,
      manager_user_id: managerScoped && user.role !== "admin" ? user.id : row.managerUserId ?? row.manager_user_id ?? null,
      property_id: row.propertyId ?? row.property_id ?? null,
      record_type: recordType,
      starts_at: row.startsAt ?? row.starts_at ?? row.startIso ?? null,
      ends_at: row.endsAt ?? row.ends_at ?? row.endIso ?? null,
      row_data: row,
      updated_at: new Date().toISOString(),
    };
  },
  assignOwnership: (record, user) => {
    if (user.role === "admin") return record;
    const recordType = String(record.record_type ?? "");
    const managerScoped = isManagerScopedScheduleRecordType(recordType);
    // Only stamp ownership on manager-scoped types; shared singleton records
    // (partner inquiries, planned events) keep their existing owner handling.
    return managerScoped ? { ...record, manager_user_id: user.id } : record;
  },
  assertInsertAllowed: (record, user) => {
    if (user.role === "admin") return null;
    const recordType = String(record.record_type ?? "");
    if (!isManagerScopedScheduleRecordType(recordType)) return null;
    const id = String(record.id ?? "");
    if (!managerScheduleRecordIdOwnedByUser(id, user.id, recordType)) {
      return "Record id must belong to the authenticated manager.";
    }
    return null;
  },
});

export const GET = route.GET;
export const POST = route.POST;
