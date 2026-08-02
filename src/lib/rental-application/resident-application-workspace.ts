import type { DemoApplicantRow } from "@/data/demo-portal";
import {
  isInProgressApplicationRow,
  type ApplicationRequestTarget,
  findInProgressRowForTarget,
} from "@/lib/rental-application/in-progress-application";
import {
  isWithdrawnApplicationRow,
  sortResidentApplicationRows,
} from "@/lib/rental-application/resident-application-list";

export type ResidentApplicationWorkspaceMode =
  | "loading"
  | "empty"
  | "in_progress"
  | "submitted";

export type ResidentApplicationWorkspaceState = {
  mode: ResidentApplicationWorkspaceMode;
  /** In-progress row for the current apply target, when one is named in the URL. */
  inProgressRow: DemoApplicantRow | null;
  /** Submitted applications (pending review, approved, or rejected — not drafts). */
  submittedRows: DemoApplicantRow[];
  /** True when the resident may start another property application. */
  canStartAnotherApplication: boolean;
};

export function buildResidentApplicationWorkspaceState(
  rows: DemoApplicantRow[],
  applyTarget: ApplicationRequestTarget | null,
): ResidentApplicationWorkspaceState {
  const active = sortResidentApplicationRows(
    rows.filter((row) => !isWithdrawnApplicationRow(row)),
  );
  const inProgressRows = active.filter(isInProgressApplicationRow);
  const inProgressRow = applyTarget?.propertyId.trim()
    ? findInProgressRowForTarget(active, applyTarget)
    : inProgressRows.length === 1
      ? inProgressRows[0]!
      : null;
  const submittedRows = active.filter((row) => !isInProgressApplicationRow(row));
  const canStartAnotherApplication = true;

  if (inProgressRow && applyTarget?.propertyId.trim()) {
    return {
      mode: "in_progress",
      inProgressRow,
      submittedRows,
      canStartAnotherApplication,
    };
  }

  if (inProgressRows.length > 0 || submittedRows.length > 0) {
    return {
      mode: inProgressRows.length > 0 ? "in_progress" : "submitted",
      inProgressRow: inProgressRows.length === 1 ? inProgressRows[0]! : null,
      submittedRows,
      canStartAnotherApplication,
    };
  }

  return {
    mode: "empty",
    inProgressRow: null,
    submittedRows: [],
    canStartAnotherApplication,
  };
}
