import type { DemoApplicantRow } from "@/data/demo-portal";

/**
 * Stable grouping key for ordering a resident's applications: the listing
 * IDENTIFIER, never the resolved display title.
 *
 * A row's `property` string is a DISPLAY value that resolves asynchronously —
 * it starts as the raw listing slug (e.g. `mgr-te-demo-lakeview`) and only
 * becomes the human title (`Lakeview Flats`) once the property-pipeline catalog
 * has loaded and a later write (draft-sync / edit / server re-sync) rewrites it.
 * Sorting on that mutable string made the list re-sort — and rows visibly hop —
 * every time a `MANAGER_APPLICATIONS_EVENT` fired after such a resolution.
 * `propertyId` is fixed from submission, so it groups the same listing's rows
 * together AND keeps their order invariant to title resolution.
 */
export function applicationSortPropertyKey(row: DemoApplicantRow): string {
  return (
    row.propertyId?.trim() ||
    row.application?.propertyId?.trim() ||
    row.assignedPropertyId?.trim() ||
    ""
  );
}

/**
 * Order applications for the resident list. Primary key is the STABLE property
 * identifier ({@link applicationSortPropertyKey}); the tie-break is the immutable
 * application id. Neither key changes when a listing title resolves from its slug
 * or when a row is expanded, so the list stays exactly where it is.
 *
 * Note: `name` is deliberately NOT a sort key — application ids are unique, so the
 * id tie-break is already total, and keying on the async-backfilled applicant name
 * ("Applicant" → real name) would reintroduce the same reorder-on-resolution bug.
 */
export function sortResidentApplicationRows(rows: DemoApplicantRow[]): DemoApplicantRow[] {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  return [...rows].sort((a, b) => {
    const byProperty = collator.compare(applicationSortPropertyKey(a), applicationSortPropertyKey(b));
    if (byProperty !== 0) return byProperty;
    return collator.compare(a.id, b.id);
  });
}

/**
 * A withdrawn application is a reversible, non-destructive state: it leaves the
 * resident's active list while the manager keeps the record and its history.
 */
export function isWithdrawnApplicationRow(row: Pick<DemoApplicantRow, "withdrawnAt">): boolean {
  return Boolean(row.withdrawnAt && String(row.withdrawnAt).trim());
}

/** A pending application the resident may withdraw (not approved/rejected, not already withdrawn). */
export function canResidentWithdrawApplication(
  row: Pick<DemoApplicantRow, "bucket" | "withdrawnAt">,
): boolean {
  return row.bucket === "pending" && !isWithdrawnApplicationRow(row);
}
