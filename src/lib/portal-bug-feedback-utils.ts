import type {
  BugFeedbackReporterRole,
  BugFeedbackStatus,
  BugFeedbackType,
  BugSeverity,
  PortalBugFeedbackRow,
} from "@/lib/portal-bug-feedback";

export function normalizeBugFeedbackRow(row: unknown): PortalBugFeedbackRow | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = String(r.id ?? "").trim();
  const type: BugFeedbackType =
    r.type === "feedback" || r.report_type === "feedback" || r.reportType === "feedback" ? "feedback" : "bug";
  if (!id) return null;
  const roleRaw = String(r.reporterRole ?? r.reporter_role ?? "").toLowerCase();
  return {
    id,
    type,
    reporterUserId: String(r.reporterUserId ?? r.reporter_user_id ?? "").trim(),
    reporterName: String(r.reporterName ?? r.reporter_name ?? "").trim(),
    reporterEmail: String(r.reporterEmail ?? r.reporter_email ?? "").trim().toLowerCase(),
    reporterRole: (["manager", "resident", "admin", "pro"].includes(roleRaw)
      ? roleRaw
      : "manager") as BugFeedbackReporterRole,
    pageUrl: String(r.pageUrl ?? "").trim(),
    title: String(r.title ?? "").trim(),
    description: String(r.description ?? "").trim(),
    stepsToReproduce: typeof r.stepsToReproduce === "string" ? r.stepsToReproduce.trim() : undefined,
    severity: (["low", "medium", "high", "critical"].includes(String(r.severity))
      ? r.severity
      : undefined) as BugSeverity | undefined,
    status: (["open", "reviewing", "resolved", "closed"].includes(String(r.status))
      ? r.status
      : "open") as BugFeedbackStatus,
    adminNotes: typeof r.adminNotes === "string" ? r.adminNotes.trim() : undefined,
    createdAt: String(r.createdAt ?? r.created_at ?? new Date().toISOString()),
    updatedAt: String(r.updatedAt ?? r.updated_at ?? new Date().toISOString()),
  };
}

export function isManagerSideReporterRole(role: BugFeedbackReporterRole): boolean {
  return role === "manager" || role === "pro" || role === "admin";
}

export function roleGroupLabelForFeedback(role: BugFeedbackReporterRole): string {
  if (role === "resident") return "Resident";
  if (role === "admin") return "Admin";
  if (role === "pro") return "Manager";
  return "Manager";
}

export function filterBugFeedbackByTab(
  rows: PortalBugFeedbackRow[],
  tabId: "bugs" | "feedback",
): PortalBugFeedbackRow[] {
  return [...rows]
    .filter((r) => (tabId === "bugs" ? r.type === "bug" : r.type === "feedback"))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function countBugFeedbackTabs(rows: PortalBugFeedbackRow[]): { bugs: number; feedback: number } {
  return {
    bugs: rows.filter((r) => r.type === "bug").length,
    feedback: rows.filter((r) => r.type === "feedback").length,
  };
}

export function groupBugFeedbackForAdmin(
  rows: PortalBugFeedbackRow[],
  tabId: "bugs" | "feedback",
): { managerRows: PortalBugFeedbackRow[]; residentRows: PortalBugFeedbackRow[] } {
  const filtered = filterBugFeedbackByTab(rows, tabId);
  return {
    managerRows: filtered.filter((r) => isManagerSideReporterRole(r.reporterRole)),
    residentRows: filtered.filter((r) => r.reporterRole === "resident"),
  };
}

export function isPortalBugFeedbackSchemaError(message: string | undefined | null): boolean {
  const m = String(message ?? "").toLowerCase();
  return m.includes("portal_bug_feedback_records") && m.includes("schema cache");
}

export function buildBugFeedbackReportInput(input: {
  type: BugFeedbackType;
  reporterUserId: string;
  reporterName: string;
  reporterEmail: string;
  reporterRole: BugFeedbackReporterRole;
  pageUrl?: string;
  title: string;
  description: string;
  stepsToReproduce?: string;
  severity?: BugSeverity;
  now?: string;
  id?: string;
}): PortalBugFeedbackRow {
  const now = input.now ?? new Date().toISOString();
  return {
    id: input.id ?? `bf-test-${now}`,
    type: input.type,
    reporterUserId: input.reporterUserId,
    reporterName: input.reporterName.trim(),
    reporterEmail: input.reporterEmail.trim().toLowerCase(),
    reporterRole: input.reporterRole,
    pageUrl: (input.pageUrl ?? "").trim(),
    title: input.title.trim(),
    description: input.description.trim(),
    stepsToReproduce: input.type === "bug" ? input.stepsToReproduce?.trim() : undefined,
    severity: input.type === "bug" ? input.severity ?? "medium" : undefined,
    status: "open",
    createdAt: now,
    updatedAt: now,
  };
}
