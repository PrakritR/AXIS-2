import { describe, expect, it } from "vitest";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";

describe("rate-limit", () => {
  it("allows requests within limit", () => {
    const key = `test-${Date.now()}`;
    expect(rateLimit(key, 2, 60_000).ok).toBe(true);
    expect(rateLimit(key, 2, 60_000).ok).toBe(true);
    expect(rateLimit(key, 2, 60_000).ok).toBe(false);
  });

  it("extracts client IP from headers", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(clientIpFrom(req)).toBe("1.2.3.4");
  });
});
