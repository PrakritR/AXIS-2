import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  residentApplicationFeeGate,
  residentApplicationSubmitBlocked,
  residentCanWithdrawApplication,
  shouldWaiveApplicationFeeForResident,
} from "@/lib/rental-application/application-policy";
import { IN_PROGRESS_APPLICATION_STAGE } from "@/lib/rental-application/in-progress-application";
import { findApplicationFeeCharge, findHoldingDepositCharge } from "@/lib/household-charges";

vi.mock("@/lib/manager-applications-storage", () => ({
  readManagerApplicationRows: vi.fn(() => []),
}));

vi.mock("@/lib/household-charges", () => ({
  listingApplicationFeeAmount: vi.fn(() => ({ amount: 50, displayLabel: "$50" })),
  listingHoldingDepositAmount: vi.fn(() => ({ amount: 100, displayLabel: "$100" })),
  findApplicationFeeCharge: vi.fn(() => undefined),
  findHoldingDepositCharge: vi.fn(() => undefined),
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
      holdingDepositTiming: id === "prop-deposit-at-application" ? "at_application" : "after_approval",
      holdingDeposit: "100",
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

  it("allows withdraw only for pending applications", () => {
    expect(
      residentCanWithdrawApplication({
        id: "AXIS-1",
        email: "a@test.com",
        bucket: "pending",
        name: "A",
        property: "P",
        stage: "Submitted",
      }),
    ).toBe(true);
    expect(
      residentCanWithdrawApplication({
        id: "AXIS-2",
        email: "a@test.com",
        bucket: "approved",
        name: "A",
        property: "P",
        stage: "Approved",
      }),
    ).toBe(false);
    expect(
      residentCanWithdrawApplication({
        id: "AXIS-3",
        email: "a@test.com",
        bucket: "rejected",
        name: "A",
        property: "P",
        stage: "Rejected",
      }),
    ).toBe(false);
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

  it("allows finishing an in-progress application on the same property", () => {
    vi.mocked(readManagerApplicationRows).mockReturnValue([
      {
        id: "AXIS-1",
        email: "a@test.com",
        bucket: "pending",
        name: "A",
        property: "P",
        propertyId: "prop-multi",
        stage: IN_PROGRESS_APPLICATION_STAGE,
      },
    ]);
    const block = residentApplicationSubmitBlocked({
      propertyId: "prop-multi",
      residentEmail: "a@test.com",
      roomChoice1: "room-a",
    });
    expect(block.blocked).toBe(false);
  });

  it("blocks duplicate submitted pending applications for the same property and room", () => {
    vi.mocked(readManagerApplicationRows).mockReturnValue([
      {
        id: "AXIS-1",
        email: "a@test.com",
        bucket: "pending",
        name: "A",
        property: "P",
        propertyId: "prop-multi",
        stage: "Submitted",
        application: { roomChoice1: "room-a" },
      },
    ]);
    const block = residentApplicationSubmitBlocked({
      propertyId: "prop-multi",
      residentEmail: "a@test.com",
      roomChoice1: "room-a",
    });
    expect(block.blocked).toBe(true);
  });

  it("defaults to no deposit due at application for a listing without holdingDepositTiming set", () => {
    const gate = residentApplicationFeeGate({
      propertyId: "prop-single",
      residentEmail: "a@test.com",
    });
    expect(gate.depositAtApplication).toBe(false);
    expect(gate.depositAmount).toBe(0);
    expect(gate.totalDue).toBe(50);
  });

  it("combines fee + deposit into totalDue when the listing opts into holdingDepositTiming=at_application", () => {
    vi.mocked(findApplicationFeeCharge).mockReturnValueOnce(undefined);
    vi.mocked(findHoldingDepositCharge).mockReturnValueOnce(undefined);
    const gate = residentApplicationFeeGate({
      propertyId: "prop-deposit-at-application",
      residentEmail: "a@test.com",
    });
    expect(gate.depositAtApplication).toBe(true);
    expect(gate.depositAmount).toBe(100);
    expect(gate.amount).toBe(50);
    expect(gate.totalDue).toBe(150);
    expect(gate.needsFee).toBe(true);
    expect(gate.feePaid).toBe(false);
  });

  it("still requires the deposit when the fee is waived by a redeemed code", () => {
    const gate = residentApplicationFeeGate({
      propertyId: "prop-deposit-at-application",
      residentEmail: "a@test.com",
      feeWaivedByCode: true,
    });
    expect(gate.amount).toBe(0);
    expect(gate.feePaid).toBe(true);
    expect(gate.depositAmount).toBe(100);
    expect(gate.totalDue).toBe(100);
    expect(gate.needsFee).toBe(true);
  });

  it("is fully paid only once both the fee and the deposit charges are paid", () => {
    vi.mocked(findApplicationFeeCharge).mockReturnValueOnce({ status: "paid" } as never);
    vi.mocked(findHoldingDepositCharge).mockReturnValueOnce(undefined);
    const partial = residentApplicationFeeGate({
      propertyId: "prop-deposit-at-application",
      residentEmail: "a@test.com",
    });
    expect(partial.feePaid).toBe(true);
    expect(partial.paid).toBe(false);
    expect(partial.needsFee).toBe(true);

    vi.mocked(findApplicationFeeCharge).mockReturnValueOnce({ status: "paid" } as never);
    vi.mocked(findHoldingDepositCharge).mockReturnValueOnce({ status: "paid" } as never);
    const full = residentApplicationFeeGate({
      propertyId: "prop-deposit-at-application",
      residentEmail: "a@test.com",
    });
    expect(full.paid).toBe(true);
    expect(full.needsFee).toBe(false);
  });

  it("does not waive fee for in-progress-only prior application", () => {
    vi.mocked(readManagerApplicationRows).mockReturnValue([
      {
        id: "AXIS-1",
        email: "a@test.com",
        bucket: "pending",
        name: "A",
        property: "P",
        stage: IN_PROGRESS_APPLICATION_STAGE,
      },
    ]);
    expect(
      shouldWaiveApplicationFeeForResident({
        propertyId: "prop-fee-first",
        residentEmail: "a@test.com",
      }),
    ).toBe(false);
  });
});
