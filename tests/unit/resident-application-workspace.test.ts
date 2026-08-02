import { describe, expect, it } from "vitest";
import type { DemoApplicantRow } from "@/data/demo-portal";
import { buildResidentApplicationWorkspaceState } from "@/lib/rental-application/resident-application-workspace";

function row(over: Partial<DemoApplicantRow> = {}): DemoApplicantRow {
  return {
    id: "AXIS-1",
    name: "Jamie Rivera",
    property: "Alder House",
    propertyId: "prop-1",
    bucket: "pending",
    stage: "Incomplete",
    ...over,
  } as DemoApplicantRow;
}

describe("buildResidentApplicationWorkspaceState", () => {
  it("returns empty when there are no active rows", () => {
    const state = buildResidentApplicationWorkspaceState([], null);
    expect(state.mode).toBe("empty");
    expect(state.canStartAnotherApplication).toBe(true);
    expect(state.inProgressRow).toBeNull();
    expect(state.submittedRows).toEqual([]);
  });

  it("returns in_progress when a draft exists and blocks another application", () => {
    const draft = row({ stage: "In progress", application: { propertyId: "prop-1" } as DemoApplicantRow["application"] });
    const state = buildResidentApplicationWorkspaceState([draft], null);
    expect(state.mode).toBe("in_progress");
    expect(state.inProgressRow?.id).toBe("AXIS-1");
    expect(state.canStartAnotherApplication).toBe(false);
    expect(state.submittedRows).toEqual([]);
  });

  it("returns submitted when only completed applications exist", () => {
    const submitted = row({ stage: "Submitted", application: { propertyId: "prop-1" } as DemoApplicantRow["application"] });
    const state = buildResidentApplicationWorkspaceState([submitted], null);
    expect(state.mode).toBe("submitted");
    expect(state.submittedRows).toHaveLength(1);
    expect(state.canStartAnotherApplication).toBe(true);
  });

  it("ignores withdrawn rows", () => {
    const withdrawn = row({ withdrawnAt: new Date().toISOString() });
    const state = buildResidentApplicationWorkspaceState([withdrawn], null);
    expect(state.mode).toBe("empty");
  });
});
