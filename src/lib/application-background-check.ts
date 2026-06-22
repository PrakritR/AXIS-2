export type ApplicationBackgroundCheckStatus = "pending_review" | "passed" | "flagged" | "not_applicable";

export const APPLICATION_BACKGROUND_CHECK_STATUSES: ApplicationBackgroundCheckStatus[] = [
  "pending_review",
  "passed",
  "flagged",
  "not_applicable",
];

export function backgroundCheckStatusLabel(status: ApplicationBackgroundCheckStatus): string {
  switch (status) {
    case "passed":
      return "Background check passed";
    case "flagged":
      return "Flagged — needs attention";
    case "not_applicable":
      return "Not applicable";
    case "pending_review":
    default:
      return "Pending review";
  }
}

export function backgroundCheckStatusTone(
  status: ApplicationBackgroundCheckStatus,
): "neutral" | "success" | "warning" | "muted" {
  switch (status) {
    case "passed":
      return "success";
    case "flagged":
      return "warning";
    case "not_applicable":
      return "muted";
    case "pending_review":
    default:
      return "neutral";
  }
}

export function backgroundCheckStatusClassName(status: ApplicationBackgroundCheckStatus): string {
  switch (backgroundCheckStatusTone(status)) {
    case "success":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200/80";
    case "warning":
      return "bg-amber-50 text-amber-900 ring-amber-200/80";
    case "muted":
      return "bg-slate-100 text-slate-600 ring-slate-200/80";
    case "neutral":
    default:
      return "bg-blue-50 text-blue-800 ring-blue-200/80";
  }
}

export function normalizeBackgroundCheckStatus(value: unknown): ApplicationBackgroundCheckStatus | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return APPLICATION_BACKGROUND_CHECK_STATUSES.includes(trimmed as ApplicationBackgroundCheckStatus)
    ? (trimmed as ApplicationBackgroundCheckStatus)
    : undefined;
}

/** Default status for newly submitted rental applications (automation hooks in later). */
export function defaultBackgroundCheckStatusForRow(row: {
  manuallyAdded?: boolean;
  application?: unknown;
}): ApplicationBackgroundCheckStatus {
  if (row.manuallyAdded || !row.application) return "not_applicable";
  return "pending_review";
}

export function resolveBackgroundCheckStatus(row: {
  manuallyAdded?: boolean;
  application?: unknown;
  backgroundCheckStatus?: ApplicationBackgroundCheckStatus;
}): ApplicationBackgroundCheckStatus {
  return (
    normalizeBackgroundCheckStatus(row.backgroundCheckStatus) ?? defaultBackgroundCheckStatusForRow(row)
  );
}

export function applicationShowsBackgroundCheck(row: {
  manuallyAdded?: boolean;
  application?: unknown;
  backgroundCheckStatus?: ApplicationBackgroundCheckStatus;
}): boolean {
  return resolveBackgroundCheckStatus(row) !== "not_applicable";
}
