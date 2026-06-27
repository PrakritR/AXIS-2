import { createJsonRecordRoute } from "@/lib/portal-record-api";

export const runtime = "nodejs";

function feedbackType(row: Record<string, unknown>): "bug" | "feedback" {
  const raw = row.type ?? row.report_type ?? row.reportType;
  return raw === "feedback" ? "feedback" : "bug";
}

function reporterRole(row: Record<string, unknown>, fallback: string): string {
  const raw = String(row.reporterRole ?? row.reporter_role ?? fallback).toLowerCase();
  if (raw === "resident" || raw === "manager" || raw === "admin" || raw === "pro") return raw;
  return fallback;
}

const route = createJsonRecordRoute({
  table: "portal_bug_feedback_records",
  select: "id, reporter_user_id, reporter_email, reporter_role, report_type, row_data, created_at, updated_at",
  scope: (query, user) => {
    if (user.role === "admin") return query;
    return (query as { eq: (col: string, val: string) => unknown }).eq("reporter_user_id", user.id);
  },
  normalize: (row) => ({
    ...row,
    id: String(row.id ?? "").trim(),
    reporterUserId: String(row.reporterUserId ?? row.reporter_user_id ?? "").trim(),
    reporterName: String(row.reporterName ?? row.reporter_name ?? "").trim(),
    reporterEmail: String(row.reporterEmail ?? row.reporter_email ?? "").trim().toLowerCase(),
    reporterRole: reporterRole(row, "manager"),
    type: feedbackType(row),
    title: String(row.title ?? "").trim(),
    description: String(row.description ?? "").trim(),
    createdAt: String(row.createdAt ?? row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updatedAt ?? row.updated_at ?? new Date().toISOString()),
  }),
  buildUpsert: (row, user) => {
    const isAdmin = user.role === "admin";
    const reporterUserId = isAdmin
      ? String(row.reporterUserId ?? row.reporter_user_id ?? user.id)
      : user.id;
    const reporterEmail = String(
      isAdmin ? row.reporterEmail ?? row.reporter_email ?? user.email ?? "" : user.email ?? "",
    )
      .trim()
      .toLowerCase();
    const role = isAdmin ? reporterRole(row, user.role) : user.role;
    const type = feedbackType(row);
    const storedRow = {
      ...row,
      id: String(row.id ?? "").trim(),
      reporterUserId,
      reporter_user_id: reporterUserId,
      reporterEmail,
      reporter_email: reporterEmail,
      reporterRole: role,
      reporter_role: role,
      type,
      report_type: type,
    };
    return {
      id: storedRow.id,
      reporter_user_id: reporterUserId,
      reporter_email: reporterEmail,
      reporter_role: role,
      report_type: type,
      row_data: storedRow,
      updated_at: new Date().toISOString(),
    };
  },
  assignOwnership: (record, user) => {
    if (user.role === "admin") return record;
    const rowData =
      record.row_data && typeof record.row_data === "object" && !Array.isArray(record.row_data)
        ? (record.row_data as Record<string, unknown>)
        : {};
    const reporterEmail = (user.email ?? "").trim().toLowerCase();
    const reporterRole = user.role;
    return {
      ...record,
      reporter_user_id: user.id,
      reporter_email: reporterEmail,
      reporter_role: reporterRole,
      row_data: {
        ...rowData,
        reporterUserId: user.id,
        reporter_user_id: user.id,
        reporterEmail,
        reporter_email: reporterEmail,
        reporterRole,
        reporter_role: reporterRole,
      },
    };
  },
});

export const GET = route.GET;
export const POST = route.POST;
