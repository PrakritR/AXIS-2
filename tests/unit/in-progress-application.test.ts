import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildInProgressApplicationRow,
  inProgressApplicationResumeUrl,
  isInProgressApplicationRow,
  isSubmittedPendingApplicationRow,
  syncInProgressApplicationRow,
  IN_PROGRESS_APPLICATION_STAGE,
} from "@/lib/rental-application/in-progress-application";
import { residentApplicationSubmitBlocked } from "@/lib/rental-application/application-policy";
import { createInitialRentalWizardState } from "@/lib/rental-application/state";

vi.mock("@/lib/manager-applications-storage", async () => {
  // The downgrade rule itself is the thing under test — keep the real one.
  const actual = await vi.importActual<typeof import("@/lib/manager-applications-storage")>(
    "@/lib/manager-applications-storage",
  );
  return {
    MANAGER_APPLICATIONS_EVENT: "axis:manager-applications",
    wouldDowngradeSubmittedApplication: actual.wouldDowngradeSubmittedApplication,
    readManagerApplicationRows: vi.fn(() => []),
    replaceManagerApplicationRowInCache: vi.fn(),
    upsertApplicationRowToServer: vi.fn(),
  };
});

vi.mock("@/lib/rental-application/data", () => ({
  getPropertyById: vi.fn((id: string) => ({
    id,
    title: "Test Property",
    managerUserId: "mgr-1",
    listingSubmission: {
      v: 1,
      allowMultiplePropertyApplications: id === "prop-multi",
    },
  })),
}));

import {
  readManagerApplicationRows,
  replaceManagerApplicationRowInCache,
  upsertApplicationRowToServer,
} from "@/lib/manager-applications-storage";

describe("in-progress-application", () => {
  it("detects in-progress pending rows", () => {
    expect(
      isInProgressApplicationRow({
        id: "AXIS-1",
        name: "A",
        property: "P",
        bucket: "pending",
        stage: IN_PROGRESS_APPLICATION_STAGE,
        detail: "",
      }),
    ).toBe(true);
    expect(
      isInProgressApplicationRow({
        id: "AXIS-2",
        name: "A",
        property: "P",
        bucket: "pending",
        stage: "Submitted",
        detail: "",
      }),
    ).toBe(false);
  });

  it("detects submitted pending rows separately from in-progress", () => {
    const inProgress = {
      id: "AXIS-1",
      name: "A",
      property: "P",
      bucket: "pending" as const,
      stage: IN_PROGRESS_APPLICATION_STAGE,
      detail: "",
    };
    const submitted = { ...inProgress, id: "AXIS-2", stage: "Submitted" };
    expect(isSubmittedPendingApplicationRow(inProgress)).toBe(false);
    expect(isSubmittedPendingApplicationRow(submitted)).toBe(true);
  });

  it("excludes a resident-withdrawn row so it never inflates the actionable pending count", () => {
    // A withdrawn application keeps bucket=pending, but the resident pulled out —
    // it is not awaiting review, so it must stay off the nav badge / dashboard count.
    const submitted = {
      id: "AXIS-3",
      name: "A",
      property: "P",
      bucket: "pending" as const,
      stage: "Submitted",
      detail: "",
    };
    const withdrawn = { ...submitted, id: "AXIS-4", withdrawnAt: "2026-07-22T00:00:00.000Z" };
    expect(isSubmittedPendingApplicationRow(submitted)).toBe(true);
    expect(isSubmittedPendingApplicationRow(withdrawn)).toBe(false);
  });

  it("builds resume url with property id", () => {
    const form = { ...createInitialRentalWizardState(), propertyId: "prop-1", fullLegalName: "Jane Doe" };
    const row = buildInProgressApplicationRow({
      axisId: "AXIS-ABC",
      form,
      residentEmail: "jane@test.com",
    });
    expect(inProgressApplicationResumeUrl("https://axis.test", row)).toBe(
      "https://axis.test/resident/applications/apply?propertyId=prop-1",
    );
  });

  it("builds a pending in-progress row from wizard form", () => {
    const form = { ...createInitialRentalWizardState(), propertyId: "prop-1", fullLegalName: "Jane Doe" };
    const row = buildInProgressApplicationRow({
      axisId: "AXIS-ABC",
      form,
      residentEmail: "jane@test.com",
    });
    expect(row.stage).toBe(IN_PROGRESS_APPLICATION_STAGE);
    expect(row.bucket).toBe("pending");
    expect(row.propertyId).toBe("prop-1");
    expect(row.email).toBe("jane@test.com");
  });
});

describe("syncInProgressApplicationRow never downgrades a submitted application", () => {
  const AXIS_ID = "PROPLANE-DRAFT001";
  const form = { ...createInitialRentalWizardState(), propertyId: "prop-1", fullLegalName: "Jane Doe" };

  beforeEach(() => {
    vi.mocked(replaceManagerApplicationRowInCache).mockClear();
    vi.mocked(upsertApplicationRowToServer).mockClear();
    vi.mocked(readManagerApplicationRows).mockReturnValue([]);
  });

  it("drops a trailing draft sync once the row is submitted", () => {
    vi.mocked(readManagerApplicationRows).mockReturnValue([
      {
        id: AXIS_ID,
        name: "Jane Doe",
        property: "P",
        propertyId: "prop-1",
        bucket: "pending",
        stage: "Submitted",
        detail: "",
        email: "jane@test.com",
      },
    ]);

    syncInProgressApplicationRow({ axisId: AXIS_ID, form, residentEmail: "jane@test.com" });

    expect(replaceManagerApplicationRowInCache).not.toHaveBeenCalled();
    expect(upsertApplicationRowToServer).not.toHaveBeenCalled();
  });

  it("still writes a draft that has not been submitted yet", () => {
    vi.mocked(readManagerApplicationRows).mockReturnValue([
      {
        id: AXIS_ID,
        name: "Jane",
        property: "P",
        propertyId: "prop-1",
        bucket: "pending",
        stage: IN_PROGRESS_APPLICATION_STAGE,
        detail: "",
        email: "jane@test.com",
      },
    ]);

    syncInProgressApplicationRow({ axisId: AXIS_ID, form, residentEmail: "jane@test.com" });

    expect(upsertApplicationRowToServer).toHaveBeenCalledTimes(1);
    expect(vi.mocked(upsertApplicationRowToServer).mock.calls[0][0].stage).toBe(IN_PROGRESS_APPLICATION_STAGE);
  });

  it("still writes the first draft when no row exists yet", () => {
    syncInProgressApplicationRow({ axisId: AXIS_ID, form, residentEmail: "jane@test.com" });
    expect(upsertApplicationRowToServer).toHaveBeenCalledTimes(1);
  });
});

describe("application-policy in-progress", () => {
  beforeEach(() => {
    vi.mocked(readManagerApplicationRows).mockReturnValue([]);
  });

  it("allows finishing an in-progress application on the same property", () => {
    vi.mocked(readManagerApplicationRows).mockReturnValue([
      {
        id: "AXIS-DRAFT",
        email: "a@test.com",
        bucket: "pending",
        name: "A",
        property: "P",
        propertyId: "prop-single",
        stage: IN_PROGRESS_APPLICATION_STAGE,
        detail: "",
      },
    ]);
    const block = residentApplicationSubmitBlocked({
      propertyId: "prop-single",
      residentEmail: "a@test.com",
    });
    expect(block.blocked).toBe(false);
  });

  it("blocks duplicate submitted pending applications", () => {
    vi.mocked(readManagerApplicationRows).mockReturnValue([
      {
        id: "AXIS-1",
        email: "a@test.com",
        bucket: "pending",
        name: "A",
        property: "P",
        propertyId: "prop-multi",
        stage: "Submitted",
        detail: "",
        application: { roomChoice1: "room-a" } as never,
      },
    ]);
    const block = residentApplicationSubmitBlocked({
      propertyId: "prop-multi",
      residentEmail: "a@test.com",
      roomChoice1: "room-a",
    });
    expect(block.blocked).toBe(true);
  });
});
