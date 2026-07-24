import { describe, expect, it } from "vitest";

import {
  googleSignInOAuthOptions,
  shouldRequestGoogleCalendarOnSignIn,
} from "@/lib/auth/google-oauth-calendar";

describe("google oauth calendar scopes", () => {
  it("requests calendar scopes for manager intent", () => {
    expect(shouldRequestGoogleCalendarOnSignIn("manager", "/auth/continue")).toBe(true);
    expect(googleSignInOAuthOptions("manager", "/auth/continue").scopes).toContain("calendar.events");
  });

  it("skips calendar scopes for residents", () => {
    expect(shouldRequestGoogleCalendarOnSignIn("resident", "/resident/applications/apply")).toBe(false);
    expect(googleSignInOAuthOptions("resident", "/resident/applications/apply")).toEqual({});
  });

  it("requests calendar scopes for manager portal destinations without explicit intent", () => {
    expect(shouldRequestGoogleCalendarOnSignIn(null, "/portal/dashboard")).toBe(true);
  });
});
