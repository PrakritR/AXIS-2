import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildInProgressApplicationRow,
  inProgressApplicationResumeUrl,
  isInProgressApplicationRow,
  isSubmittedPendingApplicationRow,
  IN_PROGRESS_APPLICATION_STAGE,
} from "@/lib/rental-application/in-progress-application";
import { residentApplicationSubmitBlocked } from "@/lib/rental-application/application-policy";
import { createInitialRentalWizardState } from "@/lib/rental-application/state";

vi.mock("@/lib/manager-applications-storage", () => ({
  readManagerApplicationRows: vi.fn(() => []),
  replaceManagerApplicationRowInCache: vi.fn(),
  upsertApplicationRowToServer: vi.fn(),
}));

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

import { readManagerApplicationRows } from "@/lib/manager-applications-storage";

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
