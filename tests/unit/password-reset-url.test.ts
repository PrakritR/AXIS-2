import { describe, expect, it } from "vitest";
import { PASSWORD_RESET_NEXT_PATH, passwordResetConfirmUrl } from "@/lib/auth/password-reset-url";

describe("passwordResetConfirmUrl", () => {
  it("builds a token_hash confirm link", () => {
    expect(passwordResetConfirmUrl("https://prop-lane.space", "abc123")).toBe(
      "https://prop-lane.space/auth/confirm?token_hash=abc123&type=recovery",
    );
  });

  it("strips trailing slash from origin", () => {
    expect(passwordResetConfirmUrl("https://prop-lane.space/", "abc123")).toBe(
      "https://prop-lane.space/auth/confirm?token_hash=abc123&type=recovery",
    );
  });

  it("url-encodes the token hash", () => {
    expect(passwordResetConfirmUrl("https://prop-lane.space", "a+b/c=")).toContain("token_hash=a%2Bb%2Fc%3D");
  });

  /**
   * Regression: the reset link used to be `/auth/callback?next=/auth/reset-password`,
   * which carried a PKCE `code` only the requesting browser could exchange. Opened in
   * a second browser it failed with "PKCE code verifier not found in storage" and the
   * user was bounced to the sign-in page as an OAuth error.
   */
  it("never points at the PKCE /auth/callback route", () => {
    const link = passwordResetConfirmUrl("https://prop-lane.space", "abc123");
    expect(link).not.toContain("/auth/callback");
    expect(link).not.toContain("code=");
  });

  it("keeps the reset destination path stable", () => {
    expect(PASSWORD_RESET_NEXT_PATH).toBe("/auth/reset-password");
  });
});
