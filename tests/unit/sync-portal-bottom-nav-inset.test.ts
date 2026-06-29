import { describe, expect, it } from "vitest";
import { formatNativeBottomNavInset, PORTAL_NATIVE_BOTTOM_NAV_INSET_FALLBACK } from "@/lib/native/sync-portal-bottom-nav-inset";

describe("sync-portal-bottom-nav-inset", () => {
  it("formats measured nav height as px", () => {
    expect(formatNativeBottomNavInset(83.2)).toBe("84px");
    expect(formatNativeBottomNavInset(0)).toBe("0px");
  });

  it("documents a CSS fallback for first paint", () => {
    expect(PORTAL_NATIVE_BOTTOM_NAV_INSET_FALLBACK).toContain("native-safe-bottom");
  });
});
