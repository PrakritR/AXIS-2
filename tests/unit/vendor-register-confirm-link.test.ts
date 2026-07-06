import { describe, expect, it } from "vitest";
import { mayLogVendorConfirmLinkLocally } from "@/lib/auth/vendor-register-local-dev";

describe("mayLogVendorConfirmLinkLocally", () => {
  it("allows local-only logging on localhost in non-production", () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevVercelEnv = process.env.VERCEL_ENV;
    process.env.NODE_ENV = "development";
    delete process.env.VERCEL_ENV;

    const req = new Request("http://localhost:3000/api/auth/vendor-register");
    expect(mayLogVendorConfirmLinkLocally(req)).toBe(true);
    expect(
      mayLogVendorConfirmLinkLocally(new Request("https://axis-2-git-main.example.vercel.app/api/auth/vendor-register")),
    ).toBe(false);

    process.env.NODE_ENV = prevNodeEnv;
    if (prevVercelEnv) process.env.VERCEL_ENV = prevVercelEnv;
  });

  it("never logs on production or Vercel production", () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevVercelEnv = process.env.VERCEL_ENV;
    process.env.NODE_ENV = "production";
    process.env.VERCEL_ENV = "production";

    expect(mayLogVendorConfirmLinkLocally(new Request("http://localhost:3000/api/auth/vendor-register"))).toBe(false);

    process.env.NODE_ENV = prevNodeEnv;
    if (prevVercelEnv) process.env.VERCEL_ENV = prevVercelEnv;
    else delete process.env.VERCEL_ENV;
  });
});
