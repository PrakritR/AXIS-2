import { describe, expect, it } from "vitest";
import { isPortalSandboxEmail } from "@/lib/portal-sandbox-accounts";

describe("portal-sandbox-accounts", () => {
  it("flags @axis.local and @test.axis.local emails", () => {
    expect(isPortalSandboxEmail("alex.morgan@axis.local")).toBe(true);
    expect(isPortalSandboxEmail("manager@test.axis.local")).toBe(true);
    expect(isPortalSandboxEmail("real.user@example.com")).toBe(false);
    expect(isPortalSandboxEmail(null)).toBe(false);
  });
});
