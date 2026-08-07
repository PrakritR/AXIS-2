import { describe, expect, it, vi, beforeEach } from "vitest";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import type { DemoApplicantRow } from "@/lib/manager-applications-storage";

const applications: DemoApplicantRow[] = [];

vi.mock("@/lib/manager-applications-storage", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/manager-applications-storage")>();
  return {
    ...actual,
    readManagerApplicationRows: () => applications,
  };
});

import {
  resolveResidentPortalAxisId,
} from "@/lib/manager-applications-storage";
import { residentLeaseAuthorized } from "@/lib/lease-pipeline-storage";

function leaseRow(overrides: Partial<LeasePipelineRow> = {}): LeasePipelineRow {
  return {
    id: "lease-1",
    residentEmail: "resident@test.proplane.local",
    residentName: "Test Resident",
    axisId: "AXIS-TEDEMOAPP4",
    managerUserId: "mgr-1",
    status: "Fully Signed",
    generatedHtml: "<p>Lease</p>",
    bucket: "resident",
    application: {},
    ...overrides,
  } as LeasePipelineRow;
}

describe("resident lease axis drift", () => {
  beforeEach(() => {
    applications.length = 0;
  });

  it("prefers the sole approved application id over a drifted profile axis id", () => {
    expect(
      resolveResidentPortalAxisId({
        profileManagerId: "AXIS-TESTRSID",
        approvedApplicationRowId: "AXIS-TEDEMOAPP4",
      }),
    ).toBe("AXIS-TEDEMOAPP4");
  });

  it("authorizes a fully signed lease when profile axis drifted but approved app matches lease axis", () => {
    applications.push({
      id: "AXIS-TEDEMOAPP4",
      email: "resident@test.proplane.local",
      bucket: "approved",
      managerUserId: "mgr-1",
    } as DemoApplicantRow);

    const row = leaseRow();
    const ctx = {
      email: "resident@test.proplane.local",
      residentAxisId: "AXIS-TESTRSID",
      profileManagerId: "AXIS-TESTRSID",
    };

    expect(residentLeaseAuthorized(row, ctx)).toBe(true);
  });
});
