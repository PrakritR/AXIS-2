import { describe, expect, it } from "vitest";
import {
  isProductionAxisHost,
  nativeAuthEntryPathClient,
  nativeAuthEntryPathForHost,
  nativeAuthEntryPathFromServerBase,
  nativeAwarePath,
  nativeShellEntryPath,
  NATIVE_AUTH_WEB_ENTRY_PATH,
  NATIVE_AUTH_WELCOME_PATH,
  NATIVE_SHELL_ENTRY_PATH,
} from "@/lib/auth/native-auth-entry";

describe("native-auth-entry", () => {
  it("native shell opens /auth/sign-in (welcome UI renders there on device)", () => {
    expect(nativeShellEntryPath()).toBe("/auth/sign-in");
    expect(NATIVE_SHELL_ENTRY_PATH).toBe("/auth/sign-in");
    expect(nativeAuthEntryPathForHost("localhost")).toBe("/auth/sign-in");
    expect(nativeAuthEntryPathForHost("www.axis-seattle-housing.com")).toBe("/auth/sign-in");
    expect(nativeAuthEntryPathFromServerBase("https://www.axis-seattle-housing.com")).toBe(
      "/auth/sign-in",
    );
  });

  it("honors CAP_NATIVE_ENTRY override", () => {
    const prev = process.env.CAP_NATIVE_ENTRY;
    process.env.CAP_NATIVE_ENTRY = "/auth/resident";
    try {
      expect(nativeShellEntryPath()).toBe("/auth/resident");
    } finally {
      process.env.CAP_NATIVE_ENTRY = prev;
    }
  });

  it("nativeAwarePath leaves marketing URLs unchanged during SSR (no window in vitest)", () => {
    expect(nativeAwarePath("/partner/pricing")).toBe("/partner/pricing");
  });

  it("isProductionAxisHost recognizes the PropLane domain and keeps the legacy host", () => {
    // New canonical domain — must be treated as production.
    expect(isProductionAxisHost("prop-lane.space")).toBe(true);
    expect(isProductionAxisHost("www.prop-lane.space")).toBe(true);
    expect(isProductionAxisHost("PROP-LANE.SPACE")).toBe(true);
    // Legacy domain still resolves (additive rebrand), so it must STILL be production.
    expect(isProductionAxisHost("axis-seattle-housing.com")).toBe(true);
    expect(isProductionAxisHost("www.axis-seattle-housing.com")).toBe(true);
    // Non-production hosts stay false.
    expect(isProductionAxisHost("localhost")).toBe(false);
    expect(isProductionAxisHost("axis-2.vercel.app")).toBe(false);
    expect(isProductionAxisHost("prop-lane.space.evil.com")).toBe(false);
  });
});

describe("native-auth-entry client defaults", () => {
  it("exports distinct web vs native entry constants", () => {
    expect(NATIVE_AUTH_WELCOME_PATH).toBe("/auth/welcome");
    expect(NATIVE_AUTH_WEB_ENTRY_PATH).toBe("/auth/sign-in");
    expect(nativeAuthEntryPathClient()).toBe("/auth/sign-in");
  });
});
