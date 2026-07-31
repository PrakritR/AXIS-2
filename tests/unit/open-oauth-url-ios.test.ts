import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authenticateMock = vi.fn();

vi.mock("@/lib/native/web-auth-session", () => ({
  WebAuthSession: {
    authenticate: (...args: unknown[]) => authenticateMock(...args),
  },
}));

vi.mock("@/lib/auth/complete-native-oauth-client", () => ({
  completeNativeOAuthInWebView: vi.fn(async () => ({ ok: true, redirectTo: "/auth/continue" })),
  appendOAuthContextToCallbackPath: (path: string) => path,
}));

function stubIosNativeShell(): void {
  vi.stubGlobal("window", {
    location: { origin: "https://prop-lane.space", pathname: "/auth/sign-in", replace: vi.fn(), href: "" },
    sessionStorage: {
      getItem: () => null,
      setItem: vi.fn(),
      removeItem: vi.fn(),
    },
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => "ios",
    },
  });
  vi.stubGlobal("document", {
    documentElement: {
      hasAttribute: (name: string) => name === "data-native",
    },
  });
}

describe("openOAuthUrl on iOS", () => {
  beforeEach(() => {
    authenticateMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("uses ASWebAuthenticationSession and completes via the custom-scheme callback", async () => {
    stubIosNativeShell();
    authenticateMock.mockResolvedValue({
      url: "space.proplane.app://auth/callback?code=test-code",
    });

    const { openOAuthUrl } = await import("@/lib/native/open-url");
    await openOAuthUrl("https://accounts.google.com/o/oauth2/auth?client_id=test");

    expect(authenticateMock).toHaveBeenCalledWith({
      url: "https://accounts.google.com/o/oauth2/auth?client_id=test",
      callbackScheme: "space.proplane.app",
    });
    expect(window.location.replace).toHaveBeenCalledWith("/auth/continue");
  });

  it("clears in-progress state when the user cancels the auth sheet", async () => {
    stubIosNativeShell();
    authenticateMock.mockRejectedValue({ code: "CANCELED", message: "User canceled" });

    const { openOAuthUrl, isNativeOAuthInProgress } = await import("@/lib/native/open-url");
    await openOAuthUrl("https://accounts.google.com/o/oauth2/auth?client_id=test");

    expect(isNativeOAuthInProgress()).toBe(false);
    expect(window.location.replace).not.toHaveBeenCalled();
  });
});
