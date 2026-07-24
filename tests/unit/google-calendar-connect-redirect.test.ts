import { describe, expect, it } from "vitest";

import { shouldRedirectToGoogleCalendarConnect } from "@/lib/google-calendar/link-from-auth.server";

describe("shouldRedirectToGoogleCalendarConnect", () => {
  it("redirects managers to calendar oauth when inline link failed", () => {
    expect(
      shouldRedirectToGoogleCalendarConnect({
        linkResult: { linked: false, reason: "no_provider_token" },
        resolvedPath: "/portal/dashboard",
        intent: "manager",
        nextPath: null,
        googleAuthUser: true,
        calendarOAuthConfigured: true,
      }),
    ).toBe(true);
  });

  it("skips when already linked", () => {
    expect(
      shouldRedirectToGoogleCalendarConnect({
        linkResult: { linked: false, reason: "already_connected" },
        resolvedPath: "/portal/dashboard",
        intent: "manager",
        nextPath: null,
        googleAuthUser: true,
        calendarOAuthConfigured: true,
      }),
    ).toBe(false);
  });

  it("skips onboarding routes", () => {
    expect(
      shouldRedirectToGoogleCalendarConnect({
        linkResult: { linked: false, reason: "no_provider_token" },
        resolvedPath: "/auth/manager-oauth-finish?session_id=x",
        intent: "manager",
        nextPath: "/auth/manager-oauth-finish?session_id=x",
        googleAuthUser: true,
        calendarOAuthConfigured: true,
      }),
    ).toBe(false);
  });
});
