import { describe, expect, it } from "vitest";
import { resolvePortalApiActorRole } from "@/lib/auth/vendor-api-access";

describe("resolvePortalApiActorRole", () => {
  it("prefers the active portal cookie role for multi-role users", () => {
    expect(
      resolvePortalApiActorRole({
        effectiveRole: "vendor",
        roles: ["manager", "vendor"],
        profile: { role: "manager" } as { role: string | null },
      }),
    ).toBe("vendor");
  });

  it("falls back to the sole profile role", () => {
    expect(
      resolvePortalApiActorRole({
        effectiveRole: null,
        roles: ["vendor"],
        profile: { role: "manager" } as { role: string | null },
      }),
    ).toBe("vendor");
  });

  it("falls back to profiles.role when multiple roles and no active portal", () => {
    expect(
      resolvePortalApiActorRole({
        effectiveRole: null,
        roles: ["manager", "vendor"],
        profile: { role: "manager" } as { role: string | null },
      }),
    ).toBe("manager");
  });
});
