import { describe, expect, it } from "vitest";
import {
  portalBackgroundPrefetchEnabled,
  portalMobileLinkPrefetchEnabled,
} from "@/lib/portal-nav-prefetch";

describe("portal-nav-prefetch", () => {
  it("disables background prefetch in development", () => {
    expect(portalBackgroundPrefetchEnabled()).toBe(process.env.NODE_ENV === "production");
    expect(portalMobileLinkPrefetchEnabled()).toBe(process.env.NODE_ENV === "production");
  });
});
