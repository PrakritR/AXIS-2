import { describe, expect, it } from "vitest";
import { formatProplaneIdForDisplay, proplaneIdLookupVariants } from "@/lib/manager-id";
import { buildResidentWelcomeEmailBody } from "@/lib/resident-welcome-email";

describe("manager-id display helpers", () => {
  it("shows legacy AXIS ids as PROPLANE ids in customer copy", () => {
    expect(formatProplaneIdForDisplay("AXIS-DEMODIEGM")).toBe("PROPLANE-DEMODIEGM");
    expect(formatProplaneIdForDisplay("PROPLANE-NEW123")).toBe("PROPLANE-NEW123");
  });

  it("includes both prefixes for application lookup", () => {
    expect(proplaneIdLookupVariants("AXIS-DEMODIEGM")).toEqual(
      expect.arrayContaining(["AXIS-DEMODIEGM", "PROPLANE-DEMODIEGM"]),
    );
    expect(proplaneIdLookupVariants("PROPLANE-DEMODIEGM")).toEqual(
      expect.arrayContaining(["PROPLANE-DEMODIEGM", "AXIS-DEMODIEGM"]),
    );
  });

  it("formats approval welcome email body with PROPLANE id", () => {
    const body = buildResidentWelcomeEmailBody({
      residentName: "Diego Morales",
      axisId: "AXIS-DEMODIEGM",
      signupUrl: "http://localhost:3000/auth/resident-setup?proplane_id=PROPLANE-DEMODIEGM",
    });
    expect(body).toContain("Your PropLane ID: PROPLANE-DEMODIEGM");
    expect(body).not.toContain("AXIS-DEMODIEGM");
  });
});
