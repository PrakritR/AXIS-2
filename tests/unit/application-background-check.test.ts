import { describe, expect, it } from "vitest";
import type { DemoApplicantRow } from "@/data/demo-portal";
import {
  applicationShowsBackgroundCheck,
  backgroundCheckStatusLabel,
  defaultBackgroundCheckStatusForRow,
  resolveBackgroundCheckStatus,
} from "@/lib/application-background-check";

function row(partial: Partial<DemoApplicantRow> = {}): DemoApplicantRow {
  return {
    id: "AXIS-TEST",
    name: "Test Applicant",
    property: "Test House",
    stage: "Submitted",
    bucket: "pending",
    detail: "",
    ...partial,
  };
}

describe("application-background-check", () => {
  it("defaults rental applications to pending review", () => {
    const applicant = row({ application: { propertyId: "prop-1" } as DemoApplicantRow["application"] });
    expect(defaultBackgroundCheckStatusForRow(applicant)).toBe("pending_review");
    expect(resolveBackgroundCheckStatus(applicant)).toBe("pending_review");
    expect(backgroundCheckStatusLabel("pending_review")).toBe("Pending review");
    expect(applicationShowsBackgroundCheck(applicant)).toBe(true);
  });

  it("marks manually added residents as not applicable", () => {
    const resident = row({ manuallyAdded: true });
    expect(defaultBackgroundCheckStatusForRow(resident)).toBe("not_applicable");
    expect(applicationShowsBackgroundCheck(resident)).toBe(false);
  });

  it("uses stored status when present", () => {
    const flagged = row({
      application: { propertyId: "prop-1" } as DemoApplicantRow["application"],
      backgroundCheckStatus: "flagged",
    });
    expect(resolveBackgroundCheckStatus(flagged)).toBe("flagged");
    expect(backgroundCheckStatusLabel("flagged")).toBe("Flagged — needs attention");
  });
});
