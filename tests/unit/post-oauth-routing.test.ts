import { describe, expect, it } from "vitest";
import {
  applyOAuthSurfaceToPath,
  defaultOAuthNextPath,
  mapPostOAuthPathForNative,
  resolvePostOAuthPathFromRoles,
} from "@/lib/auth/post-oauth-routing";

describe("post-oauth routing", () => {
  it("defaults manager, resident, and vendor next paths", () => {
    expect(defaultOAuthNextPath("manager")).toBe("/portal/dashboard");
    expect(defaultOAuthNextPath("resident")).toBe("/resident/applications/apply");
    expect(defaultOAuthNextPath("vendor")).toBe("/vendor/dashboard");
    expect(defaultOAuthNextPath(null)).toBe("/auth/continue");
  });

  it("maps marketing pricing to native manager plan path", () => {
    expect(mapPostOAuthPathForNative("/partner/pricing")).toBe("/auth/manager/plan");
    expect(mapPostOAuthPathForNative("/partner/pricing?x=1")).toBe("/auth/manager/plan?x=1");
  });

  it("applies native surface mapping on the server redirect", () => {
    expect(applyOAuthSurfaceToPath("/partner/pricing", "native")).toBe("/auth/manager/plan");
    expect(applyOAuthSurfaceToPath("/portal/dashboard", "native")).toBe("/portal/dashboard");
    expect(applyOAuthSurfaceToPath("/partner/pricing", "web")).toBe("/partner/pricing");
  });

  it("resolves single-role users directly to their dashboard", () => {
    expect(resolvePostOAuthPathFromRoles(["manager"], "/auth/continue")).toBe("/portal/dashboard");
    expect(resolvePostOAuthPathFromRoles(["resident"], "/auth/continue")).toBe("/resident");
    expect(resolvePostOAuthPathFromRoles(["manager", "resident"], "/auth/continue")).toBe("/auth/choose-portal");
  });
});
