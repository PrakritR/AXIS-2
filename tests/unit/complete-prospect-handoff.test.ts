import { describe, expect, it } from "vitest";
import { prospectMessageHandoffRedirect } from "@/lib/auth/complete-prospect-handoff.server";

describe("prospectMessageHandoffRedirect", () => {
  it("returns the safe property-scoped compose path when provided", () => {
    expect(
      prospectMessageHandoffRedirect(
        "/resident/communication/active?propertyId=mgr-test&compose=1",
      ),
    ).toBe("/resident/communication/active?propertyId=mgr-test&compose=1");
  });

  it("falls back to the communication hub when next is missing or unsafe", () => {
    expect(prospectMessageHandoffRedirect()).toBe("/resident/communication/active");
    expect(prospectMessageHandoffRedirect("https://evil.example")).toBe(
      "/resident/communication/active",
    );
  });
});
