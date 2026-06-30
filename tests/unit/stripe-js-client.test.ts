import { describe, expect, it } from "vitest";
import {
  isStripeLivePublishableKey,
  stripeLiveJsBlockedMessage,
} from "@/lib/stripe/stripe-js-client";

describe("stripe-js-client", () => {
  it("blocks live publishable keys on http origins", () => {
    const prev = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_live_test";
    try {
      expect(isStripeLivePublishableKey()).toBe(true);
      expect(isStripeLivePublishableKey("pk_test_abc")).toBe(false);
      expect(stripeLiveJsBlockedMessage("http:")).toMatch(/HTTPS/i);
      expect(stripeLiveJsBlockedMessage("https:")).toBeNull();
    } finally {
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = prev;
    }
  });
});
