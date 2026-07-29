import { describe, expect, it } from "vitest";
import {
  appendResidentPortalLoginInstructions,
  buildLeaseReadyForResidentMessage,
} from "@/lib/resident-portal-login-copy";

describe("resident portal login copy", () => {
  it("includes Google sign-in guidance and lease next step", () => {
    const body = buildLeaseReadyForResidentMessage({
      residentName: "Junaid",
      residentEmail: "mdj.1342@gmail.com",
      unit: "Room 5",
      variant: "send",
    });
    expect(body).toContain("Continue with Google");
    expect(body).toContain("mdj.1342@gmail.com");
    expect(body).toContain("Leases in the sidebar");
  });

  it("appends login block to payment-style bodies once", () => {
    const once = appendResidentPortalLoginInstructions("Hi there,\n\nAmount due: $100", {
      residentEmail: "pay@test.com",
      afterLoginHint: "payments",
    });
    expect(once).toContain("open Payments");
    const twice = appendResidentPortalLoginInstructions(once, { residentEmail: "pay@test.com" });
    expect(twice).toBe(once);
  });
});
