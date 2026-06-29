import { describe, expect, it } from "vitest";
import { isBareDashboardPath, normalizePostAuthPath } from "@/lib/auth/normalize-post-auth-path";

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
});
