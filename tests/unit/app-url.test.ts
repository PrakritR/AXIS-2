import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { resolveAppOrigin, resolveShareableAppOrigin } from "@/lib/app-url";

describe("resolveShareableAppOrigin", () => {
  const prevCanonical = process.env.NEXT_PUBLIC_CANONICAL_APP_URL;
  const prevApp = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_CANONICAL_APP_URL = prevCanonical;
    process.env.NEXT_PUBLIC_APP_URL = prevApp;
  });

  it("prefers canonical URL over vercel deployment", () => {
    process.env.NEXT_PUBLIC_CANONICAL_APP_URL = "https://axis.example";
    process.env.NEXT_PUBLIC_APP_URL = "https://axis-2.vercel.app";
    expect(resolveShareableAppOrigin("https://axis-2.vercel.app")).toBe("https://axis.example");
  });

  it("prefers non-vercel browser origin when canonical is unset", () => {
    delete process.env.NEXT_PUBLIC_CANONICAL_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://axis-2.vercel.app";
    expect(resolveShareableAppOrigin("https://axis.example")).toBe("https://axis.example");
  });

  it("falls back to vercel env when only vercel origins are available", () => {
    delete process.env.NEXT_PUBLIC_CANONICAL_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://axis-2.vercel.app";
    expect(resolveShareableAppOrigin("https://axis-2.vercel.app")).toBe("https://axis-2.vercel.app");
  });

  it("falls back to localhost default", () => {
    delete process.env.NEXT_PUBLIC_CANONICAL_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(resolveShareableAppOrigin()).toBe("http://localhost:3000");
  });
});

describe("resolveAppOrigin", () => {
  const prev = process.env.NEXT_PUBLIC_APP_URL;
  const prevCanonical = process.env.NEXT_PUBLIC_CANONICAL_APP_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = prev;
    process.env.NEXT_PUBLIC_CANONICAL_APP_URL = prevCanonical;
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

  it("uses canonical URL for non-local Stripe return URLs", () => {
    process.env.NEXT_PUBLIC_CANONICAL_APP_URL = "https://axis.example";
    process.env.NEXT_PUBLIC_APP_URL = "https://axis-2.vercel.app";
    const req = new Request("https://axis-2.vercel.app/api/stripe/checkout", { method: "POST" });
    expect(resolveAppOrigin(req)).toBe("https://axis.example");
  });

  it("falls back to request origin when env is unset", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const req = new Request("https://custom.example/api/stripe/checkout", { method: "POST" });
    expect(resolveAppOrigin(req)).toBe("https://custom.example");
  });
});
