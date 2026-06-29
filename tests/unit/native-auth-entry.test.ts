import { describe, expect, it } from "vitest";
import {
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

  it("nativeAwarePath maps marketing URLs when native (no window in vitest — path passthrough)", () => {
    expect(nativeAwarePath("/partner/pricing")).toBe("/partner/pricing");
  });
});

describe("native-auth-entry client defaults", () => {
  it("exports distinct web vs native entry constants", () => {
    expect(NATIVE_AUTH_WELCOME_PATH).toBe("/auth/welcome");
    expect(NATIVE_AUTH_WEB_ENTRY_PATH).toBe("/auth/sign-in");
    expect(nativeAuthEntryPathClient()).toBe("/auth/sign-in");
  });
});
