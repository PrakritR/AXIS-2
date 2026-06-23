import { describe, expect, it } from "vitest";
import { PASSWORD_RESET_NEXT_PATH, passwordResetCallbackUrl } from "@/lib/auth/password-reset-url";

describe("passwordResetCallbackUrl", () => {
  it("builds callback url with reset-password next path", () => {
    expect(passwordResetCallbackUrl("https://axis.example.com")).toBe(
      `https://axis.example.com/auth/callback?next=${encodeURIComponent(PASSWORD_RESET_NEXT_PATH)}`,
    );
  });

  it("strips trailing slash from origin", () => {
    expect(passwordResetCallbackUrl("https://axis.example.com/")).toBe(
      `https://axis.example.com/auth/callback?next=${encodeURIComponent(PASSWORD_RESET_NEXT_PATH)}`,
    );
  });
});
