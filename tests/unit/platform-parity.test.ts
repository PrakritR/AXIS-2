import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertInAppPushPath,
  IN_APP_PATH_PREFIXES,
  isInAppPath,
  isNativeDeepLinkPath,
  REGISTERED_PUSH_DEEP_LINKS,
} from "@/lib/platform/parity";
import { isNativeAppAllowedPath } from "@/lib/auth/native-entry-paths";
import { RESIDENT_FREE_MANAGER_SECTIONS } from "@/lib/manager-access";
import {
  RESIDENT_APPROVED_PORTAL_SECTIONS,
  RESIDENT_FREE_TIER_SECTION_IDS,
  RESIDENT_LIMITED_PORTAL_SECTIONS,
  RESIDENT_PORTAL_SECTION_IDS,
  RESIDENT_PORTAL_SMOKE_PATHS,
  RESIDENT_RENDERED_SECTION_IDS,
} from "@/lib/portals/resident-sections";
import { vendorPortal, VENDOR_PORTAL_SMOKE_PATHS } from "@/lib/portals/vendor";
import { NATIVE_BOTTOM_NAV_VENDOR_PRIMARY } from "@/lib/native/portal-bottom-nav";

const RENDER_PORTAL_SECTION_SOURCE = readFileSync(
  join(process.cwd(), "src/lib/render-portal-section.tsx"),
  "utf8",
);

describe("platform parity (web + native WebView)", () => {
  it("documents that portal UI is shared — no duplicate app routes", () => {
    expect(IN_APP_PATH_PREFIXES).toContain("/resident/");
    expect(IN_APP_PATH_PREFIXES).toContain("/portal/");
  });

  it("public /contact page is an in-app route reachable from inside the native app", () => {
    // Linked from the admin portal ("Contact us") and the marketing footer/CTA,
    // so it must load inside the WebView instead of kicking out to a browser.
    expect(isInAppPath("/contact")).toBe(true);
    expect(isNativeDeepLinkPath("/contact")).toBe(true);
    expect(isNativeAppAllowedPath("/contact")).toBe(true);
  });

  it("resident free-tier ids match manager-access gating", () => {
    for (const id of RESIDENT_FREE_TIER_SECTION_IDS) {
      expect(RESIDENT_FREE_MANAGER_SECTIONS.has(id)).toBe(true);
    }
  });

  it("every limited resident section has a render handler", () => {
    for (const { section } of RESIDENT_LIMITED_PORTAL_SECTIONS) {
      expect(RESIDENT_RENDERED_SECTION_IDS as readonly string[]).toContain(section);
      expect(RENDER_PORTAL_SECTION_SOURCE).toContain(`section === "${section}"`);
    }
  });

  it("every approved-only resident section has a render handler", () => {
    const limitedIds = new Set(RESIDENT_LIMITED_PORTAL_SECTIONS.map((s) => s.section));
    for (const { section } of RESIDENT_APPROVED_PORTAL_SECTIONS) {
      if (limitedIds.has(section)) continue;
      expect(RESIDENT_RENDERED_SECTION_IDS as readonly string[]).toContain(section);
      expect(RENDER_PORTAL_SECTION_SOURCE).toContain(`section === "${section}"`);
    }
  });

  it("resident portal section ids are covered by render registry", () => {
    for (const id of RESIDENT_PORTAL_SECTION_IDS) {
      expect(RESIDENT_RENDERED_SECTION_IDS as readonly string[]).toContain(id);
    }
  });

  it("smoke-test paths are valid in-app routes for web and native", () => {
    for (const { path } of RESIDENT_PORTAL_SMOKE_PATHS) {
      expect(isInAppPath(path)).toBe(true);
      expect(isNativeDeepLinkPath(path)).toBe(true);
    }
  });

  it("documents that vendor portal UI is shared — no duplicate app routes", () => {
    expect(IN_APP_PATH_PREFIXES).toContain("/vendor/");
  });

  it("every vendor portal section has a render handler", () => {
    for (const { section } of vendorPortal.sections) {
      expect(RENDER_PORTAL_SECTION_SOURCE).toContain(`section === "${section}"`);
    }
  });

  it("vendor native bottom bar primary items are real vendor sections", () => {
    const sectionIds = new Set(vendorPortal.sections.map((s) => s.section));
    for (const section of NATIVE_BOTTOM_NAV_VENDOR_PRIMARY) {
      expect(sectionIds.has(section)).toBe(true);
    }
  });

  it("vendor smoke-test paths are valid in-app routes for web and native", () => {
    for (const { path } of VENDOR_PORTAL_SMOKE_PATHS) {
      expect(isInAppPath(path)).toBe(true);
      expect(isNativeDeepLinkPath(path)).toBe(true);
    }
  });

  it("registered push deep links are in-app paths", () => {
    for (const path of REGISTERED_PUSH_DEEP_LINKS) {
      expect(isInAppPath(path)).toBe(true);
      expect(() => assertInAppPushPath(path)).not.toThrow();
    }
  });

  it("rejects external push urls", () => {
    expect(() => assertInAppPushPath("https://example.com")).toThrow();
    expect(() => assertInAppPushPath("/unknown-outside-prefix")).toThrow();
  });
});
