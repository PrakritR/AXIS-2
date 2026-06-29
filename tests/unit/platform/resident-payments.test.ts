import { describe, expect, it } from "vitest";
import {
  coerceResidentPaymentMethodForSurface,
  residentPaymentMethodsForSurface,
  RESIDENT_NATIVE_PAYMENT_METHODS,
  RESIDENT_WEB_PAYMENT_METHODS,
} from "@/lib/platform/resident-payments";
import { readNativePlatformHeader } from "@/lib/platform/native-client";

describe("resident payment surface policy", () => {
  it("offers ACH, Link, and card on the web", () => {
    expect(residentPaymentMethodsForSurface(false)).toEqual(RESIDENT_WEB_PAYMENT_METHODS);
  });

  it("limits the native app to ACH via Stripe", () => {
    expect(residentPaymentMethodsForSurface(true)).toEqual(RESIDENT_NATIVE_PAYMENT_METHODS);
  });

  it("coerces card/link to ACH in the native app", () => {
    expect(coerceResidentPaymentMethodForSurface("card", true)).toBe("ach");
    expect(coerceResidentPaymentMethodForSurface("link", true)).toBe("ach");
    expect(coerceResidentPaymentMethodForSurface("ach", true)).toBe("ach");
  });

  it("preserves web payment method choice", () => {
    expect(coerceResidentPaymentMethodForSurface("card", false)).toBe("card");
    expect(coerceResidentPaymentMethodForSurface("link", false)).toBe("link");
  });
});

describe("native client header", () => {
  it("reads ios and android platform headers", () => {
    const ios = new Request("http://localhost", { headers: { "x-axis-native-platform": "ios" } });
    const android = new Request("http://localhost", { headers: { "x-axis-native-platform": "android" } });
    const web = new Request("http://localhost");

    expect(readNativePlatformHeader(ios)).toBe("ios");
    expect(readNativePlatformHeader(android)).toBe("android");
    expect(readNativePlatformHeader(web)).toBeNull();
  });
});
