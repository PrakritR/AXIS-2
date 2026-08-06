import { describe, expect, it } from "vitest";

import {
  googleSignInOAuthOptions,
  shouldRequestGoogleCalendarOnSignIn,
} from "@/lib/auth/google-oauth-calendar";

describe("google oauth calendar scopes", () => {
  it("keeps manager account sign-in separate from calendar consent", () => {
    expect(shouldRequestGoogleCalendarOnSignIn("manager", "/auth/continue")).toBe(false);
    const options = googleSignInOAuthOptions("manager", "/auth/continue");
    expect(options.scopes).toBeUndefined();
    expect(options.queryParams).toEqual({ prompt: "select_account" });
  });

  it("prompts account selection without calendar scopes for residents", () => {
    expect(shouldRequestGoogleCalendarOnSignIn("resident", "/resident/applications/apply")).toBe(false);
    expect(googleSignInOAuthOptions("resident", "/resident/applications/apply")).toEqual({
      queryParams: { prompt: "select_account" },
    });
  });

  it("does not infer service consent from a manager portal destination", () => {
    expect(shouldRequestGoogleCalendarOnSignIn(null, "/portal/dashboard")).toBe(false);
    expect(googleSignInOAuthOptions(null, "/portal/dashboard")).toEqual({
      queryParams: { prompt: "select_account" },
    });
  });
});
