import { createJsonRecordRoute } from "@/lib/portal-record-api";

export const runtime = "nodejs";

const route = createJsonRecordRoute({
  table: "portal_schedule_records",
  scope: (query, user) => {
    const q = query as { eq: (column: string, value: string) => unknown };
    if (user.role === "admin") return query;
    return q.eq("manager_user_id", user.id);
  },
  buildUpsert: (row) => ({
    id: row.id,
    manager_user_id: row.managerUserId ?? row.manager_user_id ?? null,
    property_id: row.propertyId ?? row.property_id ?? null,
    record_type: row.recordType ?? row.record_type ?? "event",
    starts_at: row.startsAt ?? row.starts_at ?? row.startIso ?? null,
    ends_at: row.endsAt ?? row.ends_at ?? row.endIso ?? null,
    row_data: row,
    updated_at: new Date().toISOString(),
  }),
});

export const GET = route.GET;
export const POST = route.POST;
