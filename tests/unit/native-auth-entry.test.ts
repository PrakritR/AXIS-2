import { describe, expect, it } from "vitest";
import {
  nativeAuthEntryPathForHost,
  nativeAuthEntryPathFromServerBase,
} from "@/lib/auth/native-auth-entry";

describe("native-auth-entry", () => {
  it("uses welcome on local dev hosts", () => {
    expect(nativeAuthEntryPathForHost("localhost")).toBe("/auth/welcome");
    expect(nativeAuthEntryPathForHost("192.168.5.121")).toBe("/auth/welcome");
  });

  it("uses sign-in on production until welcome is deployed", () => {
    expect(nativeAuthEntryPathForHost("www.axis-seattle-housing.com")).toBe("/auth/sign-in");
    expect(nativeAuthEntryPathFromServerBase("https://www.axis-seattle-housing.com")).toBe("/auth/sign-in");
  });

  it("honors CAP_NATIVE_ENTRY override", () => {
    const prev = process.env.CAP_NATIVE_ENTRY;
    process.env.CAP_NATIVE_ENTRY = "/auth/welcome";
    try {
      expect(nativeAuthEntryPathForHost("www.axis-seattle-housing.com")).toBe("/auth/welcome");
    } finally {
      process.env.CAP_NATIVE_ENTRY = prev;
    }
  });
});
