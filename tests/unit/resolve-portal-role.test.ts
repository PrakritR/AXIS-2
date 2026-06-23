import { describe, expect, it } from "vitest";
import { resolvePortalRoleFromEmail } from "@/lib/auth/resolve-portal-role";

describe("resolve-portal-role", () => {
  it("resolves role from email local part", () => {
    expect(resolvePortalRoleFromEmail("admin@example.com")).toBe("admin");
    expect(resolvePortalRoleFromEmail("user+manager@gmail.com")).toBe("manager");
    expect(resolvePortalRoleFromEmail("owner@example.com")).toBe("resident");
    expect(resolvePortalRoleFromEmail("hello@example.com")).toBe("resident");
  });
});
