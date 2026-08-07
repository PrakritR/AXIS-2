import { describe, expect, it } from "vitest";
import {
  buildCosignerApplyPath,
  parseCosignerSignerAppIdParam,
} from "@/lib/rental-application/cosigner-apply-link";

describe("cosigner apply link", () => {
  it("builds a public path with a normalized signer application id", () => {
    expect(buildCosignerApplyPath("proplane-abc12345")).toBe(
      "/rent/apply/cosigner?signerAppId=PROPLANE-ABC12345",
    );
  });

  it("parses signerAppId query values", () => {
    expect(parseCosignerSignerAppIdParam(" proplane-xyz98765 ")).toBe("PROPLANE-XYZ98765");
    expect(parseCosignerSignerAppIdParam("")).toBe("");
  });
});
