import { describe, expect, it } from "vitest";

/**
 * Mirrors URL helpers in native-auth-hub — stable deep links per role/mode.
 */
function buildAuthHref(
  pathname: string,
  searchParams: URLSearchParams,
  opts: { mode?: "sign-in" | "create"; role: "resident" | "manager" | "vendor" },
): string {
  const params = new URLSearchParams(searchParams.toString());
  params.set("role", opts.role);
  if (opts.mode === "create") {
    params.set("mode", "create");
  } else {
    params.delete("mode");
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

describe("auth hub deep links", () => {
  it("builds per-role create-account URLs with mode=create", () => {
    const base = new URLSearchParams();
    expect(buildAuthHref("/auth/create-account", base, { mode: "create", role: "resident" })).toBe(
      "/auth/create-account?role=resident&mode=create",
    );
    expect(buildAuthHref("/auth/create-account", base, { mode: "create", role: "manager" })).toBe(
      "/auth/create-account?role=manager&mode=create",
    );
    expect(buildAuthHref("/auth/create-account", base, { mode: "create", role: "vendor" })).toBe(
      "/auth/create-account?role=vendor&mode=create",
    );
  });

  it("preserves next when switching role on sign-in", () => {
    const params = new URLSearchParams({ next: "/portal/dashboard" });
    expect(buildAuthHref("/auth/sign-in", params, { role: "manager" })).toBe(
      "/auth/sign-in?next=%2Fportal%2Fdashboard&role=manager",
    );
  });
});
