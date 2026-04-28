import { createJsonRecordRoute } from "@/lib/portal-record-api";

export const runtime = "nodejs";

const route = createJsonRecordRoute({
  table: "portal_lease_pipeline_records",
  scope: (query, user) => {
    const q = query as { eq: (column: string, value: string) => unknown; or: (expr: string) => unknown };
    if (user.role === "admin") return query;
    if (user.role === "resident") return q.or(`resident_user_id.eq.${user.id},resident_email.eq.${user.email ?? ""}`);
    return q.eq("manager_user_id", user.id);
  },
  buildUpsert: (row) => ({
    id: row.id,
    manager_user_id: row.managerUserId ?? row.manager_user_id ?? null,
    resident_user_id: row.residentUserId ?? row.resident_user_id ?? null,
    resident_email: row.residentEmail ?? row.resident_email ?? null,
    property_id: row.propertyId ?? row.property_id ?? null,
    status: row.bucket ?? row.status ?? null,
    row_data: row,
    updated_at: new Date().toISOString(),
  }),
});

export const GET = route.GET;
export const POST = route.POST;
