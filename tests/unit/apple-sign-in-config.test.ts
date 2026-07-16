import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APPLE_SIGN_IN_INVALID_CLIENT_MESSAGE,
  APPLE_SIGN_IN_NATIVE_SETUP_MESSAGE,
  APPLE_SIGN_IN_PROVIDER_DISABLED_MESSAGE,
  APPLE_SIGN_IN_REDIRECT_SETUP_MESSAGE,
  APPLE_SIGN_IN_WEB_OAUTH_SETUP_MESSAGE,
  isAppleSignInAvailable,
  isAppleSignInDisabledOnWeb,
  isAppleSignInEnabledInEnv,
  probeSupabaseAppleOAuthUrl,
  resetAppleSignInSessionStateForTests,
  shouldShowAppleSignInErrorToast,
} from "@/lib/auth/apple-sign-in-config";

vi.mock("@/lib/native/detect-native", () => ({
  detectNativePlatformSync: vi.fn(() => null),
}));

import { detectNativePlatformSync } from "@/lib/native/detect-native";

describe("apple-sign-in-config", () => {
  const originalEnv = { ...process.env };
  const detectNative = vi.mocked(detectNativePlatformSync);

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_APPLE_SIGN_IN_ENABLED;
    detectNative.mockReturnValue(null);
    resetAppleSignInSessionStateForTests();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("isAppleSignInEnabledInEnv is false unless explicitly true", () => {
    expect(isAppleSignInEnabledInEnv()).toBe(false);
    process.env.NEXT_PUBLIC_APPLE_SIGN_IN_ENABLED = "true";
    expect(isAppleSignInEnabledInEnv()).toBe(true);
    process.env.NEXT_PUBLIC_APPLE_SIGN_IN_ENABLED = "false";
    expect(isAppleSignInEnabledInEnv()).toBe(false);
  });

  it("isAppleSignInAvailable is true on native iOS regardless of env", () => {
    detectNative.mockReturnValue("ios");
    expect(isAppleSignInAvailable()).toBe(true);
    process.env.NEXT_PUBLIC_APPLE_SIGN_IN_ENABLED = "false";
    expect(isAppleSignInAvailable()).toBe(true);
  });

  it("isAppleSignInAvailable on web is true by default and opt-out via env", () => {
    expect(isAppleSignInAvailable()).toBe(true);
    process.env.NEXT_PUBLIC_APPLE_SIGN_IN_ENABLED = "false";
    expect(isAppleSignInDisabledOnWeb()).toBe(true);
    expect(isAppleSignInAvailable()).toBe(false);
    process.env.NEXT_PUBLIC_APPLE_SIGN_IN_ENABLED = "true";
    expect(isAppleSignInAvailable()).toBe(true);
  });

  it("probeSupabaseAppleOAuthUrl rejects disabled provider JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        type: "basic",
        status: 400,
        headers: { get: () => "application/json" },
        json: async () => ({
          code: 400,
          error_code: "validation_failed",
          msg: "Unsupported provider: provider is not enabled",
        }),
      })),
    );

    const result = await probeSupabaseAppleOAuthUrl(
      "https://example.supabase.co/auth/v1/authorize?provider=apple",
    );
    expect(result).toEqual({ ok: false, message: APPLE_SIGN_IN_PROVIDER_DISABLED_MESSAGE });
  });

  it("probeSupabaseAppleOAuthUrl maps missing OAuth secret to web setup guidance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        type: "basic",
        status: 400,
        headers: { get: () => "application/json" },
        json: async () => ({
          code: 400,
          error_code: "validation_failed",
          msg: "Unsupported provider: missing OAuth secret",
        }),
      })),
    );

    const result = await probeSupabaseAppleOAuthUrl(
      "https://example.supabase.co/auth/v1/authorize?provider=apple",
    );
    expect(result).toEqual({ ok: false, message: APPLE_SIGN_IN_WEB_OAUTH_SETUP_MESSAGE });
  });

  it("probeSupabaseAppleOAuthUrl maps invalid_client to Services ID guidance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        type: "basic",
        status: 400,
        headers: { get: () => "application/json" },
        json: async () => ({
          code: 400,
          error_code: "invalid_client",
          msg: "invalid_client",
        }),
      })),
    );

    const result = await probeSupabaseAppleOAuthUrl(
      "https://example.supabase.co/auth/v1/authorize?provider=apple",
    );
    expect(result).toEqual({ ok: false, message: APPLE_SIGN_IN_INVALID_CLIENT_MESSAGE });
  });

  it("probeSupabaseAppleOAuthUrl ignores unrelated validation_failed JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        type: "basic",
        status: 400,
        headers: { get: () => "application/json" },
        json: async () => ({
          code: 400,
          error_code: "validation_failed",
          msg: "requested path is invalid",
        }),
      })),
    );

    const result = await probeSupabaseAppleOAuthUrl(
      "https://example.supabase.co/auth/v1/authorize?provider=apple",
    );
    expect(result).toEqual({ ok: true });
  });

  it("probeSupabaseAppleOAuthUrl maps redirect allowlist failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        type: "basic",
        status: 400,
        headers: { get: () => "application/json" },
        json: async () => ({
          code: 400,
          error_code: "validation_failed",
          msg: "redirect url is not allowed",
        }),
      })),
    );

    const result = await probeSupabaseAppleOAuthUrl(
      "https://example.supabase.co/auth/v1/authorize?provider=apple",
    );
    expect(result).toEqual({ ok: false, message: APPLE_SIGN_IN_REDIRECT_SETUP_MESSAGE });
  });

  it("probeSupabaseAppleOAuthUrl accepts redirect responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        type: "basic",
        status: 302,
        headers: { get: () => "text/html" },
      })),
    );

    const result = await probeSupabaseAppleOAuthUrl(
      "https://example.supabase.co/auth/v1/authorize?provider=apple",
    );
    expect(result).toEqual({ ok: true });
  });

  it("shouldShowAppleSignInErrorToast dedupes per session", () => {
    expect(shouldShowAppleSignInErrorToast(APPLE_SIGN_IN_WEB_OAUTH_SETUP_MESSAGE)).toBe(true);
    expect(shouldShowAppleSignInErrorToast(APPLE_SIGN_IN_WEB_OAUTH_SETUP_MESSAGE)).toBe(false);
    expect(shouldShowAppleSignInErrorToast(APPLE_SIGN_IN_NATIVE_SETUP_MESSAGE)).toBe(true);
  });
});
