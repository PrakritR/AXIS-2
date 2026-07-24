import { describe, expect, it } from "vitest";

import { isManagerOAuthPath } from "@/lib/auth/google-oauth-calendar";

describe("isManagerOAuthPath", () => {
  it("treats manager signup finish routes as manager oauth", () => {
    expect(isManagerOAuthPath(null, "/auth/manager-oauth-finish?session_id=abc")).toBe(true);
    expect(isManagerOAuthPath(null, "/auth/manager-register-oauth")).toBe(true);
  });

  it("rejects resident routes", () => {
    expect(isManagerOAuthPath("resident", "/resident/applications/apply")).toBe(false);
  });
});
