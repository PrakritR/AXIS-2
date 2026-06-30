import { describe, expect, it } from "vitest";
import {
  failClosedOAuthContinuePath,
  isBareDashboardPath,
  isUnsafeRedirectPath,
  normalizePostAuthPath,
} from "@/lib/auth/normalize-post-auth-path";

describe("isUnsafeRedirectPath", () => {
  it("flags protocol-relative and off-site scheme paths", () => {
    expect(isUnsafeRedirectPath("//evil.com")).toBe(true);
    expect(isUnsafeRedirectPath("/\\evil.com")).toBe(true);
    expect(isUnsafeRedirectPath("/https://evil.com")).toBe(true);
    expect(isUnsafeRedirectPath("/http://evil.com")).toBe(true);
    expect(isUnsafeRedirectPath("%2F%2Fevil.com")).toBe(true);
  });

  it("allows normal same-origin paths", () => {
    expect(isUnsafeRedirectPath("/portal/dashboard")).toBe(false);
    expect(isUnsafeRedirectPath("/auth/continue")).toBe(false);
    expect(isUnsafeRedirectPath("/resident/dashboard")).toBe(false);
  });
});

describe("normalizePostAuthPath", () => {
  it("maps bare /dashboard to role dashboard or continue", () => {
    expect(isBareDashboardPath("/dashboard")).toBe(true);
    expect(normalizePostAuthPath("/dashboard")).toBe("/auth/continue");
    expect(normalizePostAuthPath("/dashboard", "resident")).toBe("/resident/dashboard");
    expect(normalizePostAuthPath("/dashboard", "manager")).toBe("/portal/dashboard");
  });

  it("keeps valid portal paths", () => {
    expect(normalizePostAuthPath("/portal/dashboard")).toBe("/portal/dashboard");
    expect(normalizePostAuthPath("/resident/dashboard")).toBe("/resident/dashboard");
  });

  it("rejects open redirects", () => {
    expect(normalizePostAuthPath("//evil.com")).toBe("/auth/continue");
    expect(normalizePostAuthPath("//evil.com", "manager")).toBe("/portal/dashboard");
    expect(normalizePostAuthPath("/https://evil.com")).toBe("/auth/continue");
  });
});

describe("failClosedOAuthContinuePath", () => {
  it("routes through /auth/continue with a safe next param", () => {
    expect(failClosedOAuthContinuePath("/portal/dashboard")).toBe(
      "/auth/continue?next=%2Fportal%2Fdashboard",
    );
    expect(failClosedOAuthContinuePath("/auth/continue")).toBe("/auth/continue");
    expect(failClosedOAuthContinuePath("//evil.com")).toBe("/auth/continue");
  });
});
