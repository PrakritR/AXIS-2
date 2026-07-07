import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  residentApplicationFeeGate,
  residentApplicationSubmitBlocked,
  shouldWaiveApplicationFeeForResident,
} from "@/lib/rental-application/application-policy";

vi.mock("@/lib/manager-applications-storage", () => ({
  readManagerApplicationRows: vi.fn(() => []),
}));

vi.mock("@/lib/household-charges", () => ({
  listingApplicationFeeAmount: vi.fn(() => ({ amount: 50, displayLabel: "$50" })),
  findApplicationFeeCharge: vi.fn(() => undefined),
  readChargesForResident: vi.fn(() => []),
}));

vi.mock("@/lib/rental-application/data", () => ({
  getPropertyById: vi.fn((id: string) => ({
    id,
    listingSubmission: {
      v: 1,
      applicationFee: "50",
      allowMultiplePropertyApplications: id === "prop-multi",
      applicationFeeOnlyFirstApplication: id === "prop-fee-first",
    },
  })),
}));

import { readManagerApplicationRows } from "@/lib/manager-applications-storage";

describe("application-policy", () => {
  beforeEach(() => {
    vi.mocked(readManagerApplicationRows).mockReturnValue([]);
  });

  it("waives fee when listing requires fee only on first application and resident has prior app", () => {
    vi.mocked(readManagerApplicationRows).mockReturnValue([
      {
        id: "AXIS-1",
        email: "a@test.com",
        bucket: "approved",
        name: "A",
        property: "P",
        stage: "Approved",
      },
    ]);
    expect(
      shouldWaiveApplicationFeeForResident({
        propertyId: "prop-fee-first",
        residentEmail: "a@test.com",
      }),
    ).toBe(true);
    const gate = residentApplicationFeeGate({
      propertyId: "prop-fee-first",
      residentEmail: "a@test.com",
    });
    expect(gate.needsFee).toBe(false);
    expect(gate.waived).toBe(true);
  });

  it("blocks second application when multiple applications are disabled", () => {
    vi.mocked(readManagerApplicationRows).mockReturnValue([
      {
        id: "AXIS-1",
        email: "a@test.com",
        bucket: "pending",
        name: "A",
        property: "P",
        propertyId: "prop-single",
        stage: "Submitted",
      },
    ]);
    const block = residentApplicationSubmitBlocked({
      propertyId: "prop-single",
      residentEmail: "a@test.com",
    });
    expect(block.blocked).toBe(true);
  });

  it("allows another property when multiple applications are enabled", () => {
    vi.mocked(readManagerApplicationRows).mockReturnValue([
      {
        id: "AXIS-1",
        email: "a@test.com",
        bucket: "pending",
        name: "A",
        property: "P",
        propertyId: "prop-multi",
        stage: "Submitted",
      },
    ]);
    const block = residentApplicationSubmitBlocked({
      propertyId: "prop-multi",
      residentEmail: "a@test.com",
      roomChoice1: "room-b",
    });
    expect(block.blocked).toBe(false);
  });
});
