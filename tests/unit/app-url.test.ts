import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { resolveAppOrigin } from "@/lib/app-url";

describe("resolveAppOrigin", () => {
  const prev = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = prev;
  });

  it("uses localhost request origin even when env points to production", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://axis-2.vercel.app";
    const req = new Request("http://localhost:3000/api/stripe/checkout", { method: "POST" });
    expect(resolveAppOrigin(req)).toBe("http://localhost:3000");
  });

  it("uses production env URL for non-local requests", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://axis-2.vercel.app";
    const req = new Request("https://axis-2.vercel.app/api/stripe/checkout", { method: "POST" });
    expect(resolveAppOrigin(req)).toBe("https://axis-2.vercel.app");
  });

  it("falls back to request origin when env is unset", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const req = new Request("https://custom.example/api/stripe/checkout", { method: "POST" });
    expect(resolveAppOrigin(req)).toBe("https://custom.example");
  });
});
