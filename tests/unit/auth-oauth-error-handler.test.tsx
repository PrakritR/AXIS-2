// @vitest-environment jsdom
//
// `AuthOAuthErrorHandler` is mounted in the ROOT layout, so it runs on every page — including
// `/auth/sign-in?error=oauth&message=…`, the URL every native OAuth failure lands on. Those
// params are already user-facing copy this codebase wrote; re-deriving a message from them
// replaces the actionable hint with the generic string, which is the exact information loss the
// native sign-in fix exists to prevent.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

import { AuthOAuthErrorHandler } from "@/components/auth/auth-oauth-error-handler";
import { NATIVE_IOS_OAUTH_REBUILD_MESSAGE } from "@/lib/auth/oauth-failure-messages";

function stubUrl(url: string): void {
  window.history.replaceState({}, "", url);
}

describe("AuthOAuthErrorHandler", () => {
  beforeEach(() => {
    replace.mockReset();
  });

  afterEach(() => {
    cleanup();
    stubUrl("/");
  });

  it("leaves our own ?error=oauth failures alone", async () => {
    stubUrl(
      `/auth/sign-in?error=oauth&message=${encodeURIComponent(NATIVE_IOS_OAUTH_REBUILD_MESSAGE)}`,
    );

    render(<AuthOAuthErrorHandler />);

    await waitFor(() => expect(replace).not.toHaveBeenCalled());
    expect(new URLSearchParams(window.location.search).get("message")).toBe(
      NATIVE_IOS_OAUTH_REBUILD_MESSAGE,
    );
  });

  it("still forwards a genuine Supabase/Google error to sign-in with readable copy", async () => {
    stubUrl("/?error=access_denied&error_code=403");

    render(<AuthOAuthErrorHandler />);

    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    const target = new URL(replace.mock.calls[0][0] as string, "https://prop-lane.space");
    expect(target.pathname).toBe("/auth/sign-in");
    expect(target.searchParams.get("message")).toBe("Google sign-in was cancelled.");
  });
});
