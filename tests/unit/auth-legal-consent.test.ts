import { describe, expect, it } from "vitest";
import { AUTH_PRIVACY_HREF, AUTH_TERMS_HREF } from "@/components/auth/auth-mobile-primitives";

describe("auth legal consent", () => {
  it("links to public terms and privacy routes", () => {
    expect(AUTH_TERMS_HREF).toBe("/tos");
    expect(AUTH_PRIVACY_HREF).toBe("/privacy");
  });
});
