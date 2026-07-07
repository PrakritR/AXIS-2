import { describe, expect, it } from "vitest";
import { isCrossSandboxPortalPair, isPortalSandboxEmail, CROSS_SANDBOX_PORTAL_PAIR_ERROR } from "@/lib/portal-sandbox-accounts";

describe("portal-sandbox-accounts", () => {
  it("flags @axis.local and @test.axis.local emails", () => {
    expect(isPortalSandboxEmail("alex.morgan@axis.local")).toBe(true);
    expect(isPortalSandboxEmail("manager@test.axis.local")).toBe(true);
    expect(isPortalSandboxEmail("real.user@example.com")).toBe(false);
    expect(isPortalSandboxEmail(null)).toBe(false);
  });

  it("blocks links between sandbox and real portal accounts", () => {
    expect(isCrossSandboxPortalPair("alex.morgan@axis.local", "real.user@example.com")).toBe(true);
    expect(isCrossSandboxPortalPair("alex.morgan@axis.local", "manager@test.axis.local")).toBe(false);
    expect(isCrossSandboxPortalPair("real.user@example.com", "other@company.com")).toBe(false);
    expect(CROSS_SANDBOX_PORTAL_PAIR_ERROR).toMatch(/sandbox/i);
  });
});
