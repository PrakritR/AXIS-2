import { describe, expect, it } from "vitest";
import { createDefaultListingSubmission } from "@/lib/manager-listing-submission";
import { createInitialRentalWizardState } from "@/lib/rental-application/state";
import {
  findDisabledApplicationFieldViolation,
  residentApplicationScreeningAllowed,
  validateResidentApplicationSubmit,
} from "@/lib/rental-application/validate-application-submit";
import { STANDARD_APPLICATION_FIELD_CATALOG } from "@/lib/rental-application/application-field-catalog";

function validSubmittedApplication() {
  return {
    ...createInitialRentalWizardState(),
    applyingAsGroup: "no" as const,
    hasCosigner: "no" as const,
    propertyId: "prop-1",
    roomChoice1: "prop-1",
    leaseTerm: "12-Month",
    leaseStart: "2026-08-01",
    leaseEnd: "2027-07-31",
    fullLegalName: "Jordan Lee",
    dateOfBirth: "1995-01-15",
    ssn: "123-45-6789",
    driversLicense: "WA1234567",
    phone: "(206) 555-0100",
    email: "jordan@example.com",
    currentStreet: "100 Main St",
    currentCity: "Seattle",
    currentState: "WA",
    currentZip: "98101",
    noPreviousAddress: true,
    notEmployed: false,
    employer: "Axis Housing",
    monthlyIncome: "5,000",
    ref1Name: "Sam Rivera",
    ref1Relationship: "Friend",
    ref1Phone: "(206) 555-0101",
    occupancyCount: "1",
    evictionHistory: "no" as const,
    bankruptcyHistory: "no" as const,
    criminalHistory: "no" as const,
    consentCredit: true,
    consentTruth: true,
    digitalSignature: "Jordan Lee",
    dateSigned: "2026-07-07",
  };
}

describe("validate-application-submit", () => {
  it("rejects values for disabled built-in application fields", () => {
    const leaseTermDef = STANDARD_APPLICATION_FIELD_CATALOG.find((d) => d.label === "Lease term")!;
    const sub = {
      ...createDefaultListingSubmission(),
      disabledStandardApplicationKeys: [leaseTermDef.standardKey],
    };
    const violation = findDisabledApplicationFieldViolation(
      { leaseTerm: "12 months" },
      sub,
    );
    expect(violation).toContain("does not accept");
  });

  it("allows in-progress drafts without full wizard validation", () => {
    const result = validateResidentApplicationSubmit({
      application: { propertyId: "prop-1", email: "jordan@example.com" },
      property: { id: "prop-1", listingSubmission: createDefaultListingSubmission() },
      inProgress: true,
    });
    expect(result).toEqual({ ok: true });
  });

  it("enforces listing field config on submitted applications", () => {
    const leaseTermDef = STANDARD_APPLICATION_FIELD_CATALOG.find((d) => d.label === "Lease term")!;
    const sub = {
      ...createDefaultListingSubmission(),
      disabledStandardApplicationKeys: [leaseTermDef.standardKey],
    };
    const result = validateResidentApplicationSubmit({
      application: validSubmittedApplication(),
      property: { id: "prop-1", listingSubmission: sub },
      inProgress: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("does not accept");
    }
  });

  it("requires enabled fields before accepting a submitted application", () => {
    const application = validSubmittedApplication();
    application.fullLegalName = "";
    const result = validateResidentApplicationSubmit({
      application,
      property: { id: "prop-1", listingSubmission: createDefaultListingSubmission() },
      inProgress: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("does not allow screening when credit consent is disabled for the listing", () => {
    const consentDef = STANDARD_APPLICATION_FIELD_CATALOG.find(
      (d) => d.label === "Credit & background check consent",
    )!;
    const sub = {
      ...createDefaultListingSubmission(),
      disabledStandardApplicationKeys: [consentDef.standardKey],
    };
    const application = validSubmittedApplication();
    application.consentCredit = true;
    expect(residentApplicationScreeningAllowed(sub, application)).toBe(false);
    const result = validateResidentApplicationSubmit({
      application,
      property: { id: "prop-1", listingSubmission: sub },
      inProgress: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("does not accept");
    }
  });
});
