// Regression coverage for `mergeApplicationRows`'s union-merge fix — see the
// doc comment on the function in `src/lib/manager-applications-storage.ts`
// for the full "glitches back to the start of the application" story. A
// force-refetch (e.g. `syncManagerApplicationsFromServer` on mount) must
// never treat "missing from this server response" as "deleted": there is
// always a window where the wizard's per-keystroke draft write has landed in
// the LOCAL cache but the async POST that persists it to the server hasn't
// completed yet, and losing that row unmounts/remounts the embedded wizard,
// resetting its step back to 1.
import { describe, expect, it } from "vitest";
import type { DemoApplicantRow } from "@/data/demo-portal";
import { mergeApplicationRows } from "@/lib/manager-applications-storage";

function row(over: Partial<DemoApplicantRow>): DemoApplicantRow {
  return {
    id: "PROPLANE-AAAAAAAA",
    name: "Jamie Rivera",
    property: "Alder Row — 3 rooms",
    stage: "In progress",
    bucket: "pending",
    detail: "Started",
    ...over,
  };
}

describe("mergeApplicationRows", () => {
  it("keeps a locally-created row that the server hasn't persisted yet", () => {
    const local = [row({ id: "PROPLANE-LOCAL1" })];
    const serverResponse: DemoApplicantRow[] = []; // the in-flight POST hasn't landed server-side yet

    const merged = mergeApplicationRows(local, serverResponse);

    expect(merged.map((r) => r.id)).toEqual(["PROPLANE-LOCAL1"]);
  });

  it("still drops nothing when the server response includes OTHER rows the local cache doesn't have", () => {
    const local = [row({ id: "PROPLANE-LOCAL1" })];
    const serverResponse = [row({ id: "PROPLANE-SERVER1", property: "Birch Court — 4 rooms" })];

    const merged = mergeApplicationRows(local, serverResponse);

    expect(new Set(merged.map((r) => r.id))).toEqual(new Set(["PROPLANE-LOCAL1", "PROPLANE-SERVER1"]));
  });

  it("prefers the server's fresher data for an id present on both sides", () => {
    const local = [row({ id: "PROPLANE-SAME1", detail: "Started earlier" })];
    const serverResponse = [row({ id: "PROPLANE-SAME1", detail: "Started earlier", stage: "Pending review" })];

    const merged = mergeApplicationRows(local, serverResponse);

    expect(merged).toHaveLength(1);
    expect(merged[0].stage).toBe("Pending review");
  });

  it("never resurrects an id present on neither side", () => {
    const merged = mergeApplicationRows([], []);
    expect(merged).toEqual([]);
  });
});
