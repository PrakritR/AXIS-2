import { describe, expect, it } from "vitest";
import {
  buildResidentCreateAccountHref,
  parseManagerApplicationLink,
} from "@/lib/auth/parse-resident-link";
import { isNativeDeepLinkPath, shouldNativeRedirectToWelcome } from "@/lib/auth/native-entry-paths";

describe("parseManagerApplicationLink", () => {
  it("parses rental apply URLs", () => {
    const parsed = parseManagerApplicationLink(
      "https://www.axis-seattle-housing.com/rent/apply?propertyId=abc&roomName=Room%202",
    );
    expect(parsed).toEqual({
      kind: "apply",
      href: "/rent/apply?propertyId=abc&roomName=Room%202",
    });
  });

  it("rejects axis ids", () => {
    expect(parseManagerApplicationLink("AXIS-ROOM42").kind).toBe("invalid");
  });

  it("rejects create-account links", () => {
    expect(
      parseManagerApplicationLink("/auth/create-account?role=resident&axis_id=AXIS-TEST123").kind,
    ).toBe("invalid");
  });

  it("rejects empty input", () => {
    expect(parseManagerApplicationLink("   ").kind).toBe("invalid");
  });
});

describe("buildResidentCreateAccountHref", () => {
  it("includes axis id and optional email", () => {
    expect(buildResidentCreateAccountHref("AXIS-1", "a@b.com")).toBe(
      "/auth/create-account?role=resident&axis_id=AXIS-1&email=a%40b.com",
    );
  });
});

describe("native entry paths", () => {
  it("redirects marketing and public-site paths on native", () => {
    expect(shouldNativeRedirectToWelcome("/")).toBe(true);
    expect(shouldNativeRedirectToWelcome("/partner")).toBe(true);
    expect(shouldNativeRedirectToWelcome("/privacy")).toBe(true);
    expect(shouldNativeRedirectToWelcome("/rent/listings/abc")).toBe(false);
    expect(shouldNativeRedirectToWelcome("/rent/browse")).toBe(false);
    expect(shouldNativeRedirectToWelcome("/rent/apply")).toBe(false);
    expect(shouldNativeRedirectToWelcome("/rent/apply/cosigner")).toBe(false);
    expect(shouldNativeRedirectToWelcome("/auth/welcome")).toBe(false);
    expect(shouldNativeRedirectToWelcome("/resident/dashboard")).toBe(false);
    expect(shouldNativeRedirectToWelcome("/onboard/pro")).toBe(true);
    expect(shouldNativeRedirectToWelcome("/billing/success")).toBe(false);
  });

  it("accepts deep link auth paths", () => {
    expect(isNativeDeepLinkPath("/auth/resident")).toBe(true);
    expect(isNativeDeepLinkPath("/rent/apply")).toBe(true);
    expect(isNativeDeepLinkPath("/partner/pricing")).toBe(true);
  });
});
