import { describe, expect, it } from "vitest";
import { AUTH_PORTAL_PICKER_OPTIONS } from "@/lib/auth/auth-portal-picker-options";
import { authCreateAccountPath } from "@/lib/auth/auth-role-signup-routes";

describe("auth role signup routes", () => {
  it("builds create-account paths for every portal role", () => {
    for (const opt of AUTH_PORTAL_PICKER_OPTIONS) {
      expect(authCreateAccountPath(opt.id)).toBe(`/auth/create-account?mode=create&role=${opt.id}`);
    }
  });

  it("includes vendor in get-started picker options", () => {
    expect(AUTH_PORTAL_PICKER_OPTIONS.map((o) => o.id)).toEqual(["manager", "resident", "vendor"]);
    expect(AUTH_PORTAL_PICKER_OPTIONS.find((o) => o.id === "vendor")?.chooserLabel).toMatch(/vendor/i);
  });
});
