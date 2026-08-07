import { describe, expect, it } from "vitest";
import {
  assessGroupLeaderApplication,
  validateGroupLeaderAppIdInput,
} from "@/lib/rental-application/group-leader-link";
import type { RentalWizardFormState } from "@/lib/rental-application/types";
import type { DemoApplicantRow } from "@/data/demo-portal";

const ORGANIZER_ID = "PROPLANE-ORGANIZER1";

function organizerRow(over: Partial<RentalWizardFormState> = {}, rowOver: Partial<DemoApplicantRow> = {}) {
  return {
    id: ORGANIZER_ID,
    name: "Jordan Reyes",
    bucket: "pending" as const,
    stage: "Submitted",
    application: {
      applyingAsGroup: "yes",
      groupRole: "first",
      groupSize: "3",
      groupId: "PROPLANE-HOUSEHOLD1",
      fullLegalName: "Jordan Reyes",
      ...over,
    } as RentalWizardFormState,
    ...rowOver,
  };
}

describe("validateGroupLeaderAppIdInput", () => {
  it("rejects empty and very short ids", () => {
    expect(validateGroupLeaderAppIdInput("").ok).toBe(false);
    expect(validateGroupLeaderAppIdInput("abc").ok).toBe(false);
  });

  it("normalizes a valid organizer application id", () => {
    const result = validateGroupLeaderAppIdInput("proplane-organizer1");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.normalized).toBe(ORGANIZER_ID);
  });
});

describe("assessGroupLeaderApplication", () => {
  it("accepts a group organizer with a minted household link", () => {
    const result = assessGroupLeaderApplication(ORGANIZER_ID, organizerRow());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.groupId).toBe("PROPLANE-HOUSEHOLD1");
      expect(result.groupSize).toBe(3);
      expect(result.organizerFirstName).toBe("Jordan");
      expect(result.propertyId).toBeNull();
    }
  });

  it("returns the organizer property when present on the row", () => {
    const result = assessGroupLeaderApplication(ORGANIZER_ID, {
      ...organizerRow(),
      propertyId: "mgr-demo-pioneer",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.propertyId).toBe("mgr-demo-pioneer");
  });

  it("refuses an in-progress organizer", () => {
    const result = assessGroupLeaderApplication(
      ORGANIZER_ID,
      organizerRow({ groupRole: null, groupId: "PROPLANE-HOUSEHOLD1" }, { stage: "In progress" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_submitted");
  });

  it("refuses a missing application", () => {
    const result = assessGroupLeaderApplication(ORGANIZER_ID, null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_found");
  });

  it("refuses a non-organizer application", () => {
    const result = assessGroupLeaderApplication(
      ORGANIZER_ID,
      organizerRow({ groupRole: "joining", groupLeaderAppId: "PROPLANE-OTHER" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_group_organizer");
  });

  it("refuses an organizer who has not finished group setup", () => {
    const result = assessGroupLeaderApplication(ORGANIZER_ID, organizerRow({ groupId: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("missing_group_link");
  });
});
