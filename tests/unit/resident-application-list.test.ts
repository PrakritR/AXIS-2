import { describe, expect, it } from "vitest";
import type { DemoApplicantRow } from "@/data/demo-portal";
import {
  applicationSortPropertyKey,
  canResidentWithdrawApplication,
  isWithdrawnApplicationRow,
  sortResidentApplicationRows,
} from "@/lib/rental-application/resident-application-list";

/**
 * Minimal application row. `property` is the DISPLAY title (the async-resolved
 * value); `propertyId` is the stable identifier the ordering must anchor on.
 */
function row(partial: Partial<DemoApplicantRow> & { id: string }): DemoApplicantRow {
  return {
    name: "Applicant",
    property: "",
    stage: "In progress",
    bucket: "pending",
    detail: "",
    email: "resident@test.local",
    ...partial,
  };
}

describe("resident application list ordering", () => {
  /**
   * Regression for the reorder-on-open bug. A row's `property` is the display
   * title, resolved asynchronously from `propertyId`: it starts as the raw slug
   * and later becomes the human name. The OLD sort keyed on that title, so when a
   * slug resolved — surfaced by a draft-sync / edit / server re-sync write that
   * fires MANAGER_APPLICATIONS_EVENT — the row hopped.
   *
   * Here the unresolved slug `mgr-aspen` sorts AFTER the sibling titles `Birch`
   * and `Cedar` (all portal listing slugs start with `mgr-`), but its resolved
   * title `Aspen Court` sorts FIRST: a title-based sort would move that row from
   * the bottom to the top on resolution. Anchoring the order on the stable
   * `propertyId` makes it invariant, so the list stays exactly where it is.
   */
  it("does not reorder when a listing title resolves from its slug (even a bottom→top flip)", () => {
    const slugState = [
      row({ id: "AXIS-ASPEN", propertyId: "mgr-aspen", property: "mgr-aspen" }),
      row({ id: "AXIS-BIRCH", propertyId: "mgr-birch", property: "Birch Lofts" }),
      row({ id: "AXIS-CEDAR", propertyId: "mgr-cedar", property: "Cedar House" }),
    ];
    // Same rows after AXIS-ASPEN's slug resolves to a title that sorts first.
    const resolvedState = slugState.map((r) =>
      r.id === "AXIS-ASPEN" ? { ...r, property: "Aspen Court" } : r,
    );

    const orderOf = (rows: DemoApplicantRow[]) => sortResidentApplicationRows(rows).map((r) => r.id);

    // The only thing that changed is the resolved title; the order must not move.
    // (A title-based sort would flip AXIS-ASPEN from last to first here — the bug.)
    expect(orderOf(slugState)).toEqual(["AXIS-ASPEN", "AXIS-BIRCH", "AXIS-CEDAR"]);
    expect(orderOf(resolvedState)).toEqual(orderOf(slugState));
  });

  it("groups a listing's applications by stable id and keeps the captain's data order", () => {
    // The exact live rows: two Spruce, plus one Lakeview resolved and one still a slug.
    const rows = [
      row({ id: "AXIS-0BBDAB52", propertyId: "mgr-te-demo-lakeview", property: "Lakeview Flats" }),
      row({ id: "AXIS-8B70533F", propertyId: "mgr-te-demo-lakeview", property: "mgr-te-demo-lakeview" }),
      row({ id: "AXIS-C3D183A8", propertyId: "mgr-test-spruce", property: "Spruce Studio" }),
      row({ id: "PROPLANE-B42ACDF0", propertyId: "mgr-test-spruce", property: "Spruce Studio" }),
    ];
    expect(sortResidentApplicationRows(rows).map((r) => r.id)).toEqual([
      "AXIS-0BBDAB52",
      "AXIS-8B70533F",
      "AXIS-C3D183A8",
      "PROPLANE-B42ACDF0",
    ]);
  });

  it("is invariant to applicant name backfill (unique ids make name irrelevant to order)", () => {
    const before = [
      row({ id: "AXIS-2", propertyId: "mgr-a", name: "Applicant" }),
      row({ id: "AXIS-1", propertyId: "mgr-a", name: "Applicant" }),
    ];
    const after = before.map((r) => ({ ...r, name: r.id === "AXIS-2" ? "Zoe Zimmer" : "Aaron Ames" }));
    expect(sortResidentApplicationRows(after).map((r) => r.id)).toEqual(
      sortResidentApplicationRows(before).map((r) => r.id),
    );
  });

  it("falls back to application.propertyId then assignedPropertyId for the sort key", () => {
    expect(applicationSortPropertyKey(row({ id: "x", propertyId: "top-level" }))).toBe("top-level");
    expect(
      applicationSortPropertyKey(row({ id: "x", propertyId: undefined, application: { propertyId: "from-app" } as never })),
    ).toBe("from-app");
    expect(
      applicationSortPropertyKey(row({ id: "x", propertyId: undefined, assignedPropertyId: "placed" })),
    ).toBe("placed");
  });
});

describe("resident withdraw eligibility", () => {
  it("marks a row withdrawn only when withdrawnAt is a non-empty string", () => {
    expect(isWithdrawnApplicationRow({ withdrawnAt: undefined })).toBe(false);
    expect(isWithdrawnApplicationRow({ withdrawnAt: null })).toBe(false);
    expect(isWithdrawnApplicationRow({ withdrawnAt: "  " })).toBe(false);
    expect(isWithdrawnApplicationRow({ withdrawnAt: "2026-07-22T00:00:00.000Z" })).toBe(true);
  });

  it("allows withdrawing pending (submitted or in-progress) but not approved/rejected/withdrawn", () => {
    expect(canResidentWithdrawApplication({ bucket: "pending", withdrawnAt: null })).toBe(true);
    expect(canResidentWithdrawApplication({ bucket: "approved", withdrawnAt: null })).toBe(false);
    expect(canResidentWithdrawApplication({ bucket: "rejected", withdrawnAt: null })).toBe(false);
    expect(canResidentWithdrawApplication({ bucket: "pending", withdrawnAt: "2026-07-22T00:00:00.000Z" })).toBe(false);
  });
});
