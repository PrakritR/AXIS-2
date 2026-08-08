import { describe, expect, it } from "vitest";
import { listingApplyLabel, listingMessageLabel } from "@/lib/listing-prospect-cta-labels";

describe("listing-prospect-cta-labels", () => {
  it("uses Send message for web listing CTAs", () => {
    expect(listingMessageLabel(false)).toBe("Send message");
    expect(listingApplyLabel(false)).toBe("Apply online");
  });

  it("uses SMS copy when claw texting is enabled", () => {
    expect(listingMessageLabel(true)).toBe("Text a message");
    expect(listingApplyLabel(true)).toBe("Text to apply");
  });
});
