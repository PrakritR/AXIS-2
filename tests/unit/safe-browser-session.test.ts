import { describe, expect, it } from "vitest";
import { isStaleRefreshTokenError } from "@/lib/supabase/safe-browser-session";

describe("isStaleRefreshTokenError", () => {
  it("detects the Supabase refresh-token-not-found message", () => {
    expect(
      isStaleRefreshTokenError({
        message: "Invalid Refresh Token: Refresh Token Not Found",
        status: 400,
      }),
    ).toBe(true);
  });

  it("detects refresh-token error codes", () => {
    expect(isStaleRefreshTokenError({ code: "refresh_token_not_found" })).toBe(true);
  });

  it("ignores unrelated auth failures", () => {
    expect(isStaleRefreshTokenError({ message: "Invalid login credentials", status: 400 })).toBe(false);
  });
});
