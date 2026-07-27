import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  residentApplicationFeeGate,
  residentApplicationSubmitBlocked,
  residentCanWithdrawApplication,
  shouldWaiveApplicationFeeForResident,
} from "@/lib/rental-application/application-policy";
import { IN_PROGRESS_APPLICATION_STAGE } from "@/lib/rental-application/in-progress-application";

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

import { readManagerApplicationRows } from "@/lib/manager-applications-storage";
import { readChargesForResident } from "@/lib/household-charges";

describe("application-policy", () => {
  beforeEach(() => {
    vi.mocked(readManagerApplicationRows).mockReturnValue([]);
    vi.mocked(readChargesForResident).mockReturnValue([]);
  });

  // ── Application fee is one account-level charge, collected ONCE per resident ──
  // (No longer gated on a per-listing toggle: a repeat applicant is always
  // waived, on ANY listing, so nobody pays the fee twice.)

  it("charges the fee for a genuine first-time applicant", () => {
    // No prior application, no paid fee anywhere.
    expect(
      shouldWaiveApplicationFeeForResident({
        propertyId: "prop-a",
        residentEmail: "new@test.com",
      }),
    ).toBe(false);
    const gate = residentApplicationFeeGate({
      propertyId: "prop-a",
      residentEmail: "new@test.com",
    });
    expect(gate.needsFee).toBe(true);
    expect(gate.waived).toBe(false);
  });

  it("waives the fee for a repeat applicant on any listing (charged once, not per property)", () => {
    // A prior SUBMITTED application on a different property.
    vi.mocked(readManagerApplicationRows).mockReturnValue([
      {
        id: "AXIS-1",
        email: "a@test.com",
        bucket: "approved",
        name: "A",
        property: "P",
        propertyId: "prop-a",
        stage: "Approved",
      },
    ]);
    // New application to a DIFFERENT listing is still waived.
    expect(
      shouldWaiveApplicationFeeForResident({
        propertyId: "prop-b",
        residentEmail: "a@test.com",
      }),
    ).toBe(true);
    const gate = residentApplicationFeeGate({
      propertyId: "prop-b",
      residentEmail: "a@test.com",
    });
    expect(gate.needsFee).toBe(false);
    expect(gate.waived).toBe(true);
  });

  it("waives the fee once the resident has already paid an application fee", () => {
    vi.mocked(readChargesForResident).mockReturnValue([
      { kind: "application_fee", status: "paid" } as never,
    ]);
    expect(
      shouldWaiveApplicationFeeForResident({
        propertyId: "prop-b",
        residentEmail: "paid@test.com",
      }),
    ).toBe(true);
  });

  it("does not waive the fee for an in-progress-only prior application", () => {
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
        propertyId: "prop-a",
        residentEmail: "a@test.com",
      }),
    ).toBe(false);
  });

  // ── Multiple applications: applying to several properties is always allowed ──

  it("allows a resident with a submitted application to apply to another property", () => {
    vi.mocked(readManagerApplicationRows).mockReturnValue([
      {
        id: "AXIS-1",
        email: "a@test.com",
        bucket: "pending",
        name: "A",
        property: "P",
        propertyId: "prop-a",
        stage: "Submitted",
        application: { roomChoice1: "room-a" },
      },
    ]);
    const block = residentApplicationSubmitBlocked({
      propertyId: "prop-b",
      residentEmail: "a@test.com",
      roomChoice1: "room-x",
    });
    expect(block.blocked).toBe(false);
  });

  it("allows a second application for a different room on the same property", () => {
    vi.mocked(readManagerApplicationRows).mockReturnValue([
      {
        id: "AXIS-1",
        email: "a@test.com",
        bucket: "pending",
        name: "A",
        property: "P",
        propertyId: "prop-a",
        stage: "Submitted",
        application: { roomChoice1: "room-a" },
      },
    ]);
    const block = residentApplicationSubmitBlocked({
      propertyId: "prop-a",
      residentEmail: "a@test.com",
      roomChoice1: "room-b",
    });
    expect(block.blocked).toBe(false);
  });

  it("still blocks a duplicate pending application for the same property AND room", () => {
    vi.mocked(readManagerApplicationRows).mockReturnValue([
      {
        id: "AXIS-1",
        email: "a@test.com",
        bucket: "pending",
        name: "A",
        property: "P",
        propertyId: "prop-a",
        stage: "Submitted",
        application: { roomChoice1: "room-a" },
      },
    ]);
    const block = residentApplicationSubmitBlocked({
      propertyId: "prop-a",
      residentEmail: "a@test.com",
      roomChoice1: "room-a",
    });
    expect(block.blocked).toBe(true);
  });

  it("allows finishing an in-progress application on the same property", () => {
    vi.mocked(readManagerApplicationRows).mockReturnValue([
      {
        id: "AXIS-1",
        email: "a@test.com",
        bucket: "pending",
        name: "A",
        property: "P",
        propertyId: "prop-a",
        stage: IN_PROGRESS_APPLICATION_STAGE,
      },
    ]);
    const block = residentApplicationSubmitBlocked({
      propertyId: "prop-a",
      residentEmail: "a@test.com",
      roomChoice1: "room-a",
    });
    expect(block.blocked).toBe(false);
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
});
