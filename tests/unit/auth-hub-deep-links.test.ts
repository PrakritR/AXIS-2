import { describe, expect, it } from "vitest";
import { resolveSignInNextPath } from "@/lib/auth/post-oauth-routing";
import { isUnsafeRedirectPath } from "@/lib/auth/normalize-post-auth-path";

/** Mirrors buildCreateAccountHref in native-auth-hub. */
function buildCreateAccountHref(searchParams: URLSearchParams): string {
  const params = new URLSearchParams();
  const next = searchParams.get("next")?.trim() ?? "";
  if (next && !isUnsafeRedirectPath(next)) params.set("next", next);
  const qs = params.toString();
  return qs ? `/auth/create-account?${qs}` : "/auth/create-account";
}

describe("auth hub deep links", () => {
  it("builds role-agnostic create-account URLs", () => {
    expect(buildCreateAccountHref(new URLSearchParams())).toBe("/auth/create-account");
    expect(buildCreateAccountHref(new URLSearchParams({ next: "/portal/dashboard" }))).toBe(
      "/auth/create-account?next=%2Fportal%2Fdashboard",
    );
  });

  it("preserves next when switching role on sign-in", () => {
    const params = new URLSearchParams({ next: "/portal/dashboard", role: "manager" });
    expect(params.get("next")).toBe("/portal/dashboard");
  });
});

describe("resolveSignInNextPath", () => {
  it("prefers explicit next over intent default", () => {
    expect(resolveSignInNextPath("/rent/apply?propertyId=abc", "resident")).toBe(
      "/rent/apply?propertyId=abc",
    );
  });

  it("falls back to intent default when next is missing", () => {
    expect(resolveSignInNextPath("", "resident")).toBe("/resident/applications/apply");
    expect(resolveSignInNextPath("", "manager")).toBe("/portal/dashboard");
  });
});
