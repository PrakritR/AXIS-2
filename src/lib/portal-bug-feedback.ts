import { emitAdminUi } from "@/lib/demo-admin-ui";
import { normalizeBugFeedbackRow } from "@/lib/portal-bug-feedback-utils";

export type BugFeedbackType = "bug" | "feedback";
export type BugFeedbackReporterRole = "manager" | "resident" | "admin" | "pro";
export type BugFeedbackStatus = "open" | "reviewing" | "resolved" | "closed";
export type BugSeverity = "low" | "medium" | "high" | "critical";

export type PortalBugFeedbackRow = {
  id: string;
  type: BugFeedbackType;
  reporterUserId: string;
  reporterName: string;
  reporterEmail: string;
  reporterRole: BugFeedbackReporterRole;
  pageUrl: string;
  title: string;
  description: string;
  stepsToReproduce?: string;
  severity?: BugSeverity;
  status: BugFeedbackStatus;
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
};

let cachedRows: PortalBugFeedbackRow[] = [];
let syncedFromServer = false;

function isBrowser() {
  return typeof window !== "undefined";
}

function rid() {
  return `bf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function writeLocal(rows: PortalBugFeedbackRow[]) {
  if (!isBrowser()) return;
  cachedRows = rows;
  emitAdminUi();
}

async function persistRow(row: PortalBugFeedbackRow) {
  if (!isBrowser()) return;
  await fetch("/api/portal-bug-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "upsert", row }),
  });
}

export function readBugFeedbackRows(): PortalBugFeedbackRow[] {
  return cachedRows;
}

export async function syncBugFeedbackFromServer(opts?: { force?: boolean }): Promise<PortalBugFeedbackRow[]> {
  if (!isBrowser()) return [];
  if (syncedFromServer && !opts?.force) return cachedRows;
  try {
    const res = await fetch("/api/portal-bug-feedback", { credentials: "include" });
    const data = (await res.json().catch(() => ({}))) as { rows?: unknown[] };
    if (!res.ok) return cachedRows;
    const rows = (Array.isArray(data.rows) ? data.rows : [])
      .map(normalizeBugFeedbackRow)
      .filter((r): r is PortalBugFeedbackRow => Boolean(r));
    cachedRows = rows;
    syncedFromServer = true;
    return rows;
  } catch {
    return cachedRows;
  }
}

export async function submitBugFeedbackReport(input: {
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
}): Promise<PortalBugFeedbackRow> {
  const now = new Date().toISOString();
  const row: PortalBugFeedbackRow = {
    id: rid(),
    type: input.type,
    reporterUserId: input.reporterUserId,
    reporterName: input.reporterName.trim(),
    reporterEmail: input.reporterEmail.trim().toLowerCase(),
    reporterRole: input.reporterRole,
    pageUrl: (input.pageUrl ?? (isBrowser() ? window.location.href : "")).trim(),
    title: input.title.trim(),
    description: input.description.trim(),
    stepsToReproduce: input.type === "bug" ? input.stepsToReproduce?.trim() : undefined,
    severity: input.type === "bug" ? input.severity ?? "medium" : undefined,
    status: "open",
    createdAt: now,
    updatedAt: now,
  };
  writeLocal([row, ...cachedRows.filter((r) => r.id !== row.id)]);
  await persistRow(row);
  return row;
}

export async function updateBugFeedbackRow(
  id: string,
  patch: Partial<Pick<PortalBugFeedbackRow, "status" | "adminNotes">>,
): Promise<void> {
  const idx = cachedRows.findIndex((r) => r.id === id);
  if (idx === -1) return;
  const next: PortalBugFeedbackRow = {
    ...cachedRows[idx]!,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  const rows = [...cachedRows];
  rows[idx] = next;
  writeLocal(rows);
  await persistRow(next);
}
