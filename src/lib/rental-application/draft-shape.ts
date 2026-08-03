import type { DemoApplicantRow } from "@/data/demo-portal";

/**
 * Draft-shape vocabulary, extracted so BOTH sides of the draft-write guard can
 * read it without an import cycle.
 *
 * `in-progress-application.ts` imports `wouldDowngradeSubmittedApplication` (and
 * three other runtime values) from `manager-applications-storage.ts`, so that
 * module cannot import the predicate back from it. Everything the predicate
 * needs lives here instead; `in-progress-application.ts` re-exports these so
 * existing import paths keep working.
 */

export const IN_PROGRESS_APPLICATION_STAGE = "In progress";

/** User-facing label for draft applications (stored stage remains `In progress`). */
export const INCOMPLETE_APPLICATION_LABEL = "Incomplete";

export function isSubmittedStage(row: Pick<DemoApplicantRow, "stage">): boolean {
  return row.stage?.trim().toLowerCase() === "submitted";
}

/** The fields the draft SHAPE test reads — a row need only carry these. */
export type DraftShapedRowFields = Pick<
  DemoApplicantRow,
  "bucket" | "stage" | "application" | "propertyId" | "property"
>;

/**
 * Draft SHAPE only — a pending, unsubmitted wizard snapshot. Withdrawal is
 * deliberately NOT considered here: a withdrawn row is no longer an *active*
 * draft (that is `isInProgressApplicationRow`), but a trailing autosave carrying
 * one is still a draft WRITE and must stay on the guarded conditional-update
 * path in `/api/manager-applications`, or it clobbers the withdrawn row.
 *
 * Deliberately WIDER than `isDraftApplicationRow` (which is the exact
 * `pending` + stage "In progress" persistence guard): it also accepts legacy
 * `draft`/`started`/`incomplete` stages and stage-less rows carrying wizard
 * data. `wouldDowngradeSubmittedApplication` in `manager-applications-storage.ts`
 * uses it for the EXISTING row so a resumed legacy draft is still recognised as
 * a draft and keeps autosaving.
 */
export function isDraftShapedApplicationRow(row: DraftShapedRowFields): boolean {
  if (row.bucket !== "pending") return false;
  if (isSubmittedStage(row)) return false;
  const stage = row.stage?.trim().toLowerCase() ?? "";
  if (
    stage === IN_PROGRESS_APPLICATION_STAGE.toLowerCase() ||
    stage === INCOMPLETE_APPLICATION_LABEL.toLowerCase() ||
    stage === "draft" ||
    stage === "started"
  ) {
    return true;
  }
  // Wizard snapshot without stage metadata (common on older rows) is still an incomplete draft.
  const app = row.application;
  if (app && (app.propertyId?.trim() || app.email?.trim() || app.fullLegalName?.trim())) {
    return true;
  }
  // Pending listing metadata without an explicit submitted stage (legacy / partial row_data).
  if (!stage && (row.propertyId?.trim() || row.property?.trim())) {
    return true;
  }
  return false;
}
