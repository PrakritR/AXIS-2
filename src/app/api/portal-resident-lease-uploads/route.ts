import { createJsonRecordRoute } from "@/lib/portal-record-api";

export const runtime = "nodejs";

const route = createJsonRecordRoute({
  table: "portal_resident_lease_upload_records",
  scope: (query, user) => {
    const q = query as { or: (expr: string) => unknown };
    if (user.role === "admin") return query;
    return q.or(`resident_user_id.eq.${user.id},resident_email.eq.${user.email ?? ""}`);
  },
  buildUpsert: (row) => ({
    id: row.id,
    resident_user_id: row.residentUserId ?? row.resident_user_id ?? null,
    resident_email: row.email ?? row.residentEmail ?? row.resident_email ?? null,
    row_data: row,
    updated_at: new Date().toISOString(),
  }),
});

export const GET = route.GET;
export const POST = route.POST;
