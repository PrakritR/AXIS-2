import { describe, expect, it } from "vitest";
import { isThemeToggleRoute } from "@/lib/theme-storage";

describe("theme-storage", () => {
  it("treats portal and auth as theme-toggle routes", () => {
    expect(isThemeToggleRoute("/portal/dashboard")).toBe(true);
    expect(isThemeToggleRoute("/resident/payments")).toBe(true);
    expect(isThemeToggleRoute("/auth/sign-in")).toBe(true);
    expect(isThemeToggleRoute("/")).toBe(false);
    expect(isThemeToggleRoute("/rent/browse")).toBe(false);
  });
});
