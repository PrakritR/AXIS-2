import { describe, expect, it } from "vitest";
import {
  applicantDisplayName,
  applicantSecondaryEmail,
  isPlaceholderApplicantName,
  realApplicantName,
} from "@/lib/rental-application/applicant-name";
import { buildInProgressApplicationRow } from "@/lib/rental-application/in-progress-application";
import { applicationStartedLabel } from "@/lib/rental-application/in-progress-application";
import { createInitialRentalWizardState } from "@/lib/rental-application/state";

/**
 * F-FIN-2: "Applicant" was a STORED value on nameless application drafts, and
 * the report display context indexes resident names by email off those rows —
 * so one draft renamed the resident on 7 of 8 Finances › Income rows, and
 * Documents › Applications listed a row whose applicant name was the literal
 * word "Applicant".
 */

describe("applicant placeholder names (F-FIN-2)", () => {
  it("recognises the placeholder in every stored shape", () => {
    expect(isPlaceholderApplicantName("Applicant")).toBe(true);
    expect(isPlaceholderApplicantName("  applicant ")).toBe(true);
    expect(isPlaceholderApplicantName("")).toBe(true);
    expect(isPlaceholderApplicantName(null)).toBe(true);
    expect(isPlaceholderApplicantName("Maya Chen")).toBe(false);
  });

  it("realApplicantName drops it so it can never enter a finance record", () => {
    expect(realApplicantName("Applicant")).toBe("");
    expect(realApplicantName("Maya Chen")).toBe("Maya Chen");
  });

  it("prefers the email — which identifies the person — over the placeholder", () => {
    expect(applicantDisplayName({ name: "Applicant", email: "maya@example.com" })).toBe("maya@example.com");
    expect(applicantDisplayName({ name: "Maya Chen", email: "maya@example.com" })).toBe("Maya Chen");
    expect(applicantDisplayName({ name: "", email: "" })).toBe("Applicant");
  });

  it("does not print the email twice when it IS the display name", () => {
    expect(applicantSecondaryEmail({ name: "", email: "maya@example.com" })).toBe("");
    expect(applicantSecondaryEmail({ name: "Applicant", email: "maya@example.com" })).toBe("");
    // A case-only difference must not defeat it.
    expect(applicantSecondaryEmail({ name: "MAYA@example.com", email: "maya@example.com" })).toBe("");
    expect(applicantSecondaryEmail({ name: "Maya Chen", email: "maya@example.com" })).toBe(
      "maya@example.com",
    );
    expect(applicantSecondaryEmail({ name: "Maya Chen", email: "" })).toBe("");
  });

  it("a nameless draft is no longer STORED under the placeholder", () => {
    const row = buildInProgressApplicationRow({
      axisId: "PROPLANE-TEST0001",
      form: createInitialRentalWizardState(),
      residentEmail: "maya@example.com",
    });
    expect(row.name).toBe("");
    expect(applicantDisplayName(row)).toBe("maya@example.com");
  });

  it("keeps a real legal name when the applicant has typed one", () => {
    const row = buildInProgressApplicationRow({
      axisId: "PROPLANE-TEST0002",
      form: { ...createInitialRentalWizardState(), fullLegalName: "Maya Chen" },
      residentEmail: "maya@example.com",
    });
    expect(row.name).toBe("Maya Chen");
  });
});

describe("applicationStartedLabel (F7 — rows must be distinguishable)", () => {
  it("returns the timestamped detail stamp", () => {
    expect(applicationStartedLabel({ detail: "Started 8/1/2026, 7:48:40 PM" })).toBe(
      "Started 8/1/2026, 7:48:40 PM",
    );
    expect(applicationStartedLabel({ detail: "Submitted 8/3/2026, 5:24:39 PM" })).toBe(
      "Submitted 8/3/2026, 5:24:39 PM",
    );
  });

  it("refuses free prose so a date column never prints a sentence", () => {
    expect(applicationStartedLabel({ detail: "Lease signed — move-in scheduled" })).toBe("");
    expect(applicationStartedLabel({ detail: "" })).toBe("");
  });

  it("stamps a freshly built draft so two same-property drafts differ", () => {
    const row = buildInProgressApplicationRow({
      axisId: "PROPLANE-TEST0003",
      form: createInitialRentalWizardState(),
      residentEmail: "maya@example.com",
    });
    expect(applicationStartedLabel(row)).toMatch(/^Started /);
  });
});
