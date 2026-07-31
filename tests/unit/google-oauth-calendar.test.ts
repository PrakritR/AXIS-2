import { describe, expect, it } from "vitest";

import {
  googleSignInOAuthOptions,
  shouldRequestGoogleCalendarOnSignIn,
} from "@/lib/auth/google-oauth-calendar";

describe("google oauth calendar scopes", () => {
  it("requests calendar scopes and account chooser for manager intent", () => {
    expect(shouldRequestGoogleCalendarOnSignIn("manager", "/auth/continue")).toBe(true);
    const options = googleSignInOAuthOptions("manager", "/auth/continue");
    expect(options.scopes).toContain("calendar.events");
    expect(options.queryParams).toEqual({
      access_type: "offline",
      prompt: "select_account consent",
    });
  });

  it("prompts account selection without calendar scopes for residents", () => {
    expect(shouldRequestGoogleCalendarOnSignIn("resident", "/resident/applications/apply")).toBe(false);
    expect(googleSignInOAuthOptions("resident", "/resident/applications/apply")).toEqual({
      queryParams: { prompt: "select_account" },
    });
  });

  it("requests calendar scopes for manager portal destinations without explicit intent", () => {
    expect(shouldRequestGoogleCalendarOnSignIn(null, "/portal/dashboard")).toBe(true);
    expect(googleSignInOAuthOptions(null, "/portal/dashboard").queryParams).toEqual({
      access_type: "offline",
      prompt: "select_account consent",
    });
  });
});
