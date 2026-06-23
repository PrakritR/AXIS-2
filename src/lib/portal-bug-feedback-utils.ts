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
  const type: BugFeedbackType = r.type === "feedback" ? "feedback" : "bug";
  if (!id) return null;
  return {
    id,
    type,
    reporterUserId: String(r.reporterUserId ?? "").trim(),
    reporterName: String(r.reporterName ?? "").trim(),
    reporterEmail: String(r.reporterEmail ?? "").trim().toLowerCase(),
    reporterRole: (["manager", "resident", "admin", "pro"].includes(String(r.reporterRole))
      ? r.reporterRole
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
    createdAt: String(r.createdAt ?? new Date().toISOString()),
    updatedAt: String(r.updatedAt ?? new Date().toISOString()),
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
