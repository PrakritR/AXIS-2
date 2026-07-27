/**
 * @vitest-environment jsdom
 *
 * The fee step's inline (embedded) Stripe payment renders for BOTH live apply
 * surfaces — the public apply page AND the resident portal apply wizard (a
 * portal applicant must never be dead-ended with no way to pay) — and NEVER
 * for the portal's read-back editor of an already-submitted application. The
 * headline amount comes from the gate (server-derived), not the listing's
 * grandfathered `applicationFee` text.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/components/marketing/application-fee-inline-payment", () => ({
  ApplicationFeeInlinePayment: () => <div data-testid="inline-payment" />,
}));

import { RentalWizardStepBody, type WizardStepsProps } from "@/components/marketing/rental-wizard-steps";
import { createInitialRentalWizardState } from "@/lib/rental-application/state";
import { cachePublicExtraListings } from "@/lib/demo-property-pipeline";
import {
  createDefaultListingSubmission,
  normalizeManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";
import type { MockProperty } from "@/data/types";

const PID = "prop-mode-gate";

function seedListing(): void {
  const sub = createDefaultListingSubmission();
  sub.applicationFee = "$50";
  sub.axisPaymentsEnabled = true;
  const property: MockProperty = {
    id: PID,
    title: "Mode Gate Flat",
    tagline: "Test",
    address: "1 Test St, Seattle, WA",
    zip: "98101",
    neighborhood: "Test",
    beds: 1,
    baths: 1,
    rentLabel: "$1,200/mo",
    available: "Now",
    petFriendly: false,
    buildingId: "b1",
    buildingName: "Mode Gate Flat",
    unitLabel: "Unit 1",
    adminPublishLive: true,
    managerUserId: "mgr-mode-gate",
    listingSubmission: normalizeManagerListingSubmissionV1(sub),
  };
  cachePublicExtraListings([property], { silent: true });
}

function renderFeeStep(
  mode: "public" | "portal" | "editor",
  gate?: Partial<WizardStepsProps["applicationFeeGate"] & { pending?: boolean }>,
) {
  seedListing();
  const form = {
    ...createInitialRentalWizardState(),
    propertyId: PID,
    email: "dana@example.com",
    fullLegalName: "Dana Tenant",
    applicationFeePayChannel: "ach" as const,
  };
  const noop = () => {};
  return render(
    <RentalWizardStepBody
      step={12}
      form={form}
      errors={{}}
      mode={mode}
      propertyOptions={[]}
      patch={noop}
      applicationFeeGate={{
        needsFee: true,
        paid: false,
        displayLabel: "$75.00",
        amount: 75,
        waived: false,
        pending: false,
        ...gate,
      }}
      occupancySyncEpoch={0}
      showAvailabilityWarnings={false}
      setPhone={noop}
      setLandlordPhone={noop}
      setPrevLandlordPhone={noop}
      setSupervisorPhone={noop}
      setRef1Phone={noop}
      setRef2Phone={noop}
      setSsn={noop}
      goToStep={noop}
      editFromReview={noop}
    />,
  );
}

afterEach(() => cleanup());

describe("fee step — inline payment mode gate", () => {
  it("renders the inline payment on the public apply surface", () => {
    renderFeeStep("public");
    expect(screen.queryByTestId("inline-payment")).toBeTruthy();
  });

  it("renders the inline payment on the portal apply surface (no dead-end)", () => {
    renderFeeStep("portal");
    expect(screen.queryByTestId("inline-payment")).toBeTruthy();
  });

  it("never renders a payment in the submitted-application editor", () => {
    renderFeeStep("editor");
    expect(screen.queryByTestId("inline-payment")).toBeNull();
  });

  it("never renders the inline payment once the fee is paid — the double-charge guard", () => {
    renderFeeStep("public", { paid: true });
    expect(screen.queryByTestId("inline-payment")).toBeNull();
    expect(screen.queryByText("Paid")).toBeTruthy();
  });

  it("shows no payment UI (not even the resolving placeholder) when paid, even mid-resolve", () => {
    renderFeeStep("public", { paid: true, pending: true });
    expect(screen.queryByTestId("inline-payment")).toBeNull();
    expect(screen.queryByText(/Confirming the application fee/)).toBeNull();
  });

  it("holds payment UI while the server fee is still resolving", () => {
    renderFeeStep("public", { pending: true, displayLabel: "…" });
    expect(screen.queryByTestId("inline-payment")).toBeNull();
    expect(screen.queryByText(/Confirming the application fee/)).toBeTruthy();
  });

  it("headlines the gate's (server-derived) amount, not the listing's stored fee text", () => {
    renderFeeStep("public");
    expect(screen.queryByText("$75.00")).toBeTruthy();
    expect(screen.queryByText("$50")).toBeNull();
  });
});
