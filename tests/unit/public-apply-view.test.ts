import { describe, expect, it } from "vitest";
import { resolvePublicApplyView } from "@/lib/rental-application/public-apply-session";

/**
 * Regression coverage for the blank public apply page: a SIGNED-IN non-resident
 * (a manager or vendor renting a home) must be routed to create a separate
 * resident account, never a blank screen. The historical bug hid the account
 * prompt when signed in but never un-gated any other surface, leaving an empty
 * content area for anyone authenticated in another role.
 */
describe("resolvePublicApplyView", () => {
  const propertyId = "mgr-seed-4709a-8th-ave-ne";

  it("routes a signed-in non-resident to create a resident account (the fixed blank-page case)", () => {
    expect(
      resolvePublicApplyView({ propertyId, guestContinue: false, signedInNonResident: true }),
    ).toBe("signed-in-create-resident");
  });

  it("shows the anonymous account prompt for a signed-out visitor with a property link", () => {
    expect(
      resolvePublicApplyView({ propertyId, guestContinue: false, signedInNonResident: false }),
    ).toBe("account-prompt");
  });

  it("lets a signed-in non-resident fall back to the guest wizard when they choose guest", () => {
    expect(
      resolvePublicApplyView({ propertyId, guestContinue: true, signedInNonResident: true }),
    ).toBe("wizard");
  });

  it("shows the wizard once a signed-out visitor chose to continue as guest", () => {
    expect(
      resolvePublicApplyView({ propertyId, guestContinue: true, signedInNonResident: false }),
    ).toBe("wizard");
  });

  it("shows the wizard immediately when there is no property link, regardless of session", () => {
    for (const signedInNonResident of [true, false]) {
      expect(
        resolvePublicApplyView({ propertyId: "", guestContinue: false, signedInNonResident }),
      ).toBe("wizard");
      expect(
        resolvePublicApplyView({ propertyId: "   ", guestContinue: false, signedInNonResident }),
      ).toBe("wizard");
    }
  });

  it("only ever renders one real surface — the gate is never blank", () => {
    for (const guestContinue of [true, false]) {
      for (const signedInNonResident of [true, false]) {
        const view = resolvePublicApplyView({ propertyId, guestContinue, signedInNonResident });
        expect(["account-prompt", "signed-in-create-resident", "wizard"]).toContain(view);
      }
    }
  });
});
