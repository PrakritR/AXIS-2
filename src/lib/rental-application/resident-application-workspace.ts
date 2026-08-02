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
  /** At most one active draft — the resident may only edit one application at a time. */
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
  const inProgressRow =
    (applyTarget?.propertyId.trim()
      ? findInProgressRowForTarget(active, applyTarget)
      : null) ??
    (inProgressRows.length === 1 ? inProgressRows[0]! : inProgressRows[0] ?? null);
  const submittedRows = active.filter((row) => !isInProgressApplicationRow(row));

  if (inProgressRow) {
    return {
      mode: "in_progress",
      inProgressRow,
      submittedRows,
      canStartAnotherApplication: false,
    };
  }

  if (submittedRows.length > 0) {
    return {
      mode: "submitted",
      inProgressRow: null,
      submittedRows,
      canStartAnotherApplication: true,
    };
  }

  return {
    mode: "empty",
    inProgressRow: null,
    submittedRows: [],
    canStartAnotherApplication: true,
  };
}
