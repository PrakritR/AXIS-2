import { createJsonRecordRoute } from "@/lib/portal-record-api";

export const runtime = "nodejs";

const route = createJsonRecordRoute({
  table: "portal_pro_relationship_records",
  scope: (query, user) => {
    const q = query as { or: (expr: string) => unknown };
    if (user.role === "admin") return query;
    return q.or(`manager_user_id.eq.${user.id},related_user_id.eq.${user.id},related_email.eq.${user.email ?? ""}`);
  },
  buildUpsert: (row) => ({
    id: row.id,
    manager_user_id: row.managerUserId ?? row.manager_user_id ?? null,
    related_user_id: row.relatedUserId ?? row.related_user_id ?? null,
    related_email: row.relatedEmail ?? row.related_email ?? null,
    row_data: row,
    updated_at: new Date().toISOString(),
  }),
});

export const GET = route.GET;
export const POST = route.POST;
