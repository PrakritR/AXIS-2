import { describe, expect, it } from "vitest";
import { resolveNativeApplePostAuthPath } from "@/lib/auth/native-apple-sign-in";

describe("resolveNativeApplePostAuthPath", () => {
  it("routes resident signup to oauth finish", () => {
    expect(
      resolveNativeApplePostAuthPath({
        fixedCallbackPath: "/auth/callback/resident-signup",
      }),
    ).toBe("/auth/resident-oauth-finish");
  });

  it("routes vendor signup to oauth finish", () => {
    expect(
      resolveNativeApplePostAuthPath({
        fixedCallbackPath: "/auth/callback/vendor-signup",
      }),
    ).toBe("/auth/vendor-oauth-finish");
  });

  it("routes generic sign-in to continue", () => {
    expect(resolveNativeApplePostAuthPath({})).toBe("/auth/continue");
  });

  it("routes resident intent to applications", () => {
    expect(
      resolveNativeApplePostAuthPath({
        intent: "resident",
        viaContinue: false,
        nextPath: "/resident/applications",
      }),
    ).toBe("/resident/applications");
  });
});
