import { describe, expect, it } from "vitest";
import {
  assessCosignerSignerApplication,
  validateCosignerSignerAppIdInput,
} from "@/lib/rental-application/cosigner-signer-link";
import type { RentalWizardFormState } from "@/lib/rental-application/types";
import type { DemoApplicantRow } from "@/data/demo-portal";

const SIGNER_ID = "PROPLANE-SIGNER01";

function signerRow(over: Partial<RentalWizardFormState> = {}, rowOver: Partial<DemoApplicantRow> = {}) {
  return {
    id: SIGNER_ID,
    name: "Alex Morgan",
    propertyId: "mgr-demo-oak",
    bucket: "pending" as const,
    stage: "Submitted",
    application: {
      fullLegalName: "Alex Morgan",
      propertyId: "mgr-demo-oak",
      ...over,
    } as RentalWizardFormState,
    ...rowOver,
  };
}

describe("validateCosignerSignerAppIdInput", () => {
  it("normalizes a valid signer application id", () => {
    const result = validateCosignerSignerAppIdInput("proplane-signer01");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.normalized).toBe(SIGNER_ID);
  });
});

describe("assessCosignerSignerApplication", () => {
  it("returns the signer name and property for a linked application", () => {
    const result = assessCosignerSignerApplication(SIGNER_ID, signerRow());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.signerAppId).toBe(SIGNER_ID);
      expect(result.signerFullName).toBe("Alex Morgan");
      expect(result.propertyId).toBe("mgr-demo-oak");
    }
  });

  it("refuses a missing application", () => {
    const result = assessCosignerSignerApplication(SIGNER_ID, null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_found");
  });

  it("refuses an in-progress application", () => {
    const result = assessCosignerSignerApplication(
      SIGNER_ID,
      signerRow({}, { bucket: "pending", stage: "In progress" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_submitted");
  });
});
