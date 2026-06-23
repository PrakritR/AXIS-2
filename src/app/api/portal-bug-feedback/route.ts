import { createJsonRecordRoute } from "@/lib/portal-record-api";

export const runtime = "nodejs";

const route = createJsonRecordRoute({
  table: "portal_bug_feedback_records",
  scope: (query, user) => {
    if (user.role === "admin") return query;
    return (query as { eq: (col: string, val: string) => unknown }).eq("reporter_user_id", user.id);
  },
  normalize: (row) => ({
    ...row,
    id: String(row.id ?? "").trim(),
    reporterEmail: String(row.reporterEmail ?? row.reporter_email ?? "").trim().toLowerCase(),
    type: row.type === "feedback" ? "feedback" : "bug",
  }),
  buildUpsert: (row, user) => ({
    id: row.id,
    reporter_user_id: row.reporterUserId ?? row.reporter_user_id ?? user.id,
    reporter_email: String(row.reporterEmail ?? row.reporter_email ?? user.email ?? "").trim().toLowerCase(),
    reporter_role: String(row.reporterRole ?? row.reporter_role ?? user.role),
    report_type: row.type === "feedback" ? "feedback" : "bug",
    row_data: row,
    updated_at: new Date().toISOString(),
  }),
  assignOwnership: (record, user) => ({
    ...record,
    reporterUserId: user.id,
    reporterEmail: user.email,
    reporterRole: user.role,
  }),
});

export const GET = route.GET;
export const POST = route.POST;
