import { describe, expect, it } from "vitest";

import {
  OAUTH_GENERIC_FAILURE_MESSAGE,
  oauthErrorFromParams,
} from "@/lib/auth/oauth-error-params";
import { nativeOAuthSignInFailureUrl } from "@/lib/auth/complete-native-oauth";
import {
  NATIVE_IOS_OAUTH_REBUILD_MESSAGE,
  nativeOAuthNoReturnMessage,
} from "@/lib/auth/oauth-failure-messages";
import { OAUTH_CANCELLED_MESSAGE } from "@/lib/auth/parse-oauth-error";

describe("oauthErrorFromParams", () => {
  it("returns null when the URL carries no OAuth error", () => {
    expect(oauthErrorFromParams(new URLSearchParams(""))).toBeNull();
    expect(oauthErrorFromParams(new URLSearchParams("next=/portal"))).toBeNull();
    expect(oauthErrorFromParams(null)).toBeNull();
  });

  it("returns a ?message= this codebase authored", () => {
    for (const authored of [
      NATIVE_IOS_OAUTH_REBUILD_MESSAGE,
      nativeOAuthNoReturnMessage(),
      OAUTH_CANCELLED_MESSAGE,
    ]) {
      const params = new URLSearchParams({ error: "oauth", message: authored });
      expect(oauthErrorFromParams(params)).toBe(authored);
    }
  });

  it("refuses a ?message= it did not author", () => {
    // `/auth/sign-in` renders this above a real password field on the real domain, so a crafted
    // link must not be able to put its own sentence there.
    const attacker = new URLSearchParams({
      error: "oauth",
      message: "Your account is locked. Call PropLane support at 555-0123 to restore access.",
    });
    expect(oauthErrorFromParams(attacker)).toBe(OAUTH_GENERIC_FAILURE_MESSAGE);

    // Not even a near-miss on real copy — it is exact-match only.
    const nearMiss = new URLSearchParams({
      error: "oauth",
      message: `${NATIVE_IOS_OAUTH_REBUILD_MESSAGE} Call 555-0123.`,
    });
    expect(oauthErrorFromParams(nearMiss)).toBe(OAUTH_GENERIC_FAILURE_MESSAGE);
  });

  it("falls back to a generic message when the error has no message", () => {
    expect(oauthErrorFromParams(new URLSearchParams("error=oauth"))).toBe(
      OAUTH_GENERIC_FAILURE_MESSAGE,
    );
    expect(oauthErrorFromParams(new URLSearchParams("error=auth"))).toBe(
      OAUTH_GENERIC_FAILURE_MESSAGE,
    );
    // A blank message must not read as "no error at all".
    expect(oauthErrorFromParams(new URLSearchParams("error=oauth&message=%20%20"))).toBe(
      OAUTH_GENERIC_FAILURE_MESSAGE,
    );
  });

  it("round-trips what nativeOAuthSignInFailureUrl actually sends", () => {
    // `/auth/sign-in` is the single landing spot for every native OAuth failure. If the params
    // it is handed do not parse back out, the user just sees the page reload with no reason —
    // which is exactly how this shipped.
    const url = new URL(
      nativeOAuthSignInFailureUrl(NATIVE_IOS_OAUTH_REBUILD_MESSAGE, "https://prop-lane.space"),
    );
    expect(url.pathname).toBe("/auth/sign-in");
    expect(oauthErrorFromParams(url.searchParams)).toBe(NATIVE_IOS_OAUTH_REBUILD_MESSAGE);
  });
});
