// @vitest-environment jsdom
//
// A dismissed Apple sheet must be reported as a cancellation, not just as copy that happens to
// say "cancelled". The button hides the inline error on `cancelled`, so if this flag stops
// being set — or stops being carried through `startAppleSignIn` — a deliberate dismissal
// silently becomes red error text under the sign-in form again.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authorize = vi.fn();

vi.mock("@capacitor-community/apple-sign-in", () => ({
  SignInWithApple: { authorize: (...args: unknown[]) => authorize(...args) },
}));

vi.mock("@/lib/native/detect-native", () => ({
  detectNativePlatformSync: () => "ios",
}));

vi.mock("@capacitor/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@capacitor/core")>()),
  Capacitor: { isPluginAvailable: () => true },
}));

describe("Apple sign-in cancellation flag", () => {
  beforeEach(() => {
    authorize.mockReset();
    authorize.mockRejectedValue(new Error("The operation was canceled."));
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("marks a dismissed sheet as cancelled", async () => {
    const { runNativeAppleSignIn, APPLE_SIGN_IN_CANCELLED_MESSAGE } = await import(
      "@/lib/auth/native-apple-sign-in"
    );

    const result = await runNativeAppleSignIn({} as never, {});

    expect(result).toEqual({
      ok: false,
      message: APPLE_SIGN_IN_CANCELLED_MESSAGE,
      cancelled: true,
    });
  });

  it("carries the flag through startAppleSignIn to the button", async () => {
    const { startAppleSignIn } = await import("@/lib/auth/start-apple-sign-in");
    const { APPLE_SIGN_IN_CANCELLED_MESSAGE } = await import("@/lib/auth/native-apple-sign-in");

    const result = await startAppleSignIn({ supabase: {} as never, provider: "apple" });

    expect(result).toEqual({
      ok: false,
      message: APPLE_SIGN_IN_CANCELLED_MESSAGE,
      cancelled: true,
    });
  });

  it("does NOT mark a real failure as cancelled", async () => {
    authorize.mockRejectedValue(new Error("Authorization attempt failed."));

    const { runNativeAppleSignIn } = await import("@/lib/auth/native-apple-sign-in");
    const result = await runNativeAppleSignIn({} as never, {});

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.cancelled).toBeFalsy();
  });
});

describe("cancellation is classified at the authorization step only", () => {
  it("does NOT treat a token-exchange abort as a user cancellation", async () => {
    // On iOS an aborted request surfaces as NSURLErrorCancelled. Before this was scoped, that
    // was reported as `cancelled`, and because cancellation is silent the user saw NOTHING at
    // all for a real network failure — the silent failure this whole change removes.
    vi.resetModules();
    vi.doMock("@capacitor-community/apple-sign-in", () => ({
      SignInWithApple: {
        authorize: async () => ({ response: { identityToken: "tok" } }),
      },
    }));

    const supabase = {
      auth: {
        signInWithIdToken: async () => {
          throw new Error("The request was cancelled. (NSURLErrorDomain -999)");
        },
        updateUser: async () => ({ data: {}, error: null }),
      },
    };

    const { runNativeAppleSignIn } = await import("@/lib/auth/native-apple-sign-in");
    const result = await runNativeAppleSignIn(supabase as never, {});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.cancelled).toBeFalsy();
    }
  });
});
