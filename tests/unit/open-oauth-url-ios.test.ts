import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authenticateMock = vi.fn();
const isPluginAvailableMock = vi.fn();
const browserOpenMock = vi.fn();

vi.mock("@capacitor/browser", () => ({
  Browser: {
    open: (...args: unknown[]) => browserOpenMock(...args),
    close: vi.fn(),
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
  },
}));

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
    getLaunchUrl: vi.fn(async () => undefined),
  },
}));

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
      isPluginAvailable: (...args: unknown[]) => isPluginAvailableMock(...args),
    },
    setTimeout: (fn: () => void) => {
      fn();
      return 0;
    },
  });
  vi.stubGlobal("document", {
    documentElement: {
      hasAttribute: (name: string) => name === "data-native",
    },
  });
}

describe("usesIosAsWebAuthenticationSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns true on iOS when the WebAuthSession plugin is linked", async () => {
    stubIosNativeShell();
    isPluginAvailableMock.mockImplementation((name: string) => name === "WebAuthSession");

    const { usesIosAsWebAuthenticationSession } = await import("@/lib/native/ios-oauth");
    expect(usesIosAsWebAuthenticationSession()).toBe(true);
    expect(isPluginAvailableMock).toHaveBeenCalledWith("WebAuthSession");
  });

  it("returns false on iOS when the WebAuthSession plugin is absent", async () => {
    stubIosNativeShell();
    isPluginAvailableMock.mockReturnValue(false);

    const { usesIosAsWebAuthenticationSession } = await import("@/lib/native/ios-oauth");
    expect(usesIosAsWebAuthenticationSession()).toBe(false);
  });
});

function stubAndroidNativeShell(): void {
  vi.stubGlobal("window", {
    location: { origin: "https://prop-lane.space", pathname: "/auth/sign-in", replace: vi.fn(), href: "" },
    sessionStorage: {
      getItem: () => null,
      setItem: vi.fn(),
      removeItem: vi.fn(),
    },
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => "android",
      isPluginAvailable: (...args: unknown[]) => isPluginAvailableMock(...args),
    },
    setTimeout: (fn: () => void) => {
      fn();
      return 0;
    },
  });
  vi.stubGlobal("document", {
    documentElement: {
      hasAttribute: (name: string) => name === "data-native",
      getAttribute: (name: string) => (name === "data-native" ? "android" : null),
    },
  });
}

describe("openOAuthUrl on Android", () => {
  beforeEach(() => {
    authenticateMock.mockReset();
    browserOpenMock.mockReset();
    isPluginAvailableMock.mockReturnValue(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("still uses the system browser (Chrome Custom Tabs) — not affected by the iOS guard", async () => {
    stubAndroidNativeShell();

    const { openOAuthUrl } = await import("@/lib/native/open-url");
    await openOAuthUrl("https://accounts.google.com/o/oauth2/auth?client_id=test");

    expect(authenticateMock).not.toHaveBeenCalled();
    expect(browserOpenMock).toHaveBeenCalledWith({
      url: "https://accounts.google.com/o/oauth2/auth?client_id=test",
      presentationStyle: "fullscreen",
    });
  });
});

describe("openOAuthUrl on iOS", () => {
  beforeEach(() => {
    authenticateMock.mockReset();
    browserOpenMock.mockReset();
    isPluginAvailableMock.mockImplementation((name: string) => name === "WebAuthSession");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("uses ASWebAuthenticationSession when the plugin is present", async () => {
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
    expect(browserOpenMock).not.toHaveBeenCalled();
    expect(window.location.replace).toHaveBeenCalledWith("/auth/continue");
  });

  it("refuses SFSafariViewController and reports an update hint when the plugin is absent", async () => {
    // A legacy iOS binary predates WebAuthSession. It must NOT fall back to
    // SFSafariViewController (@capacitor/browser) — that renders the portal inside
    // in-app Safari. It fails with a rebuild hint instead.
    stubIosNativeShell();
    isPluginAvailableMock.mockReturnValue(false);

    const { openOAuthUrl, NATIVE_IOS_OAUTH_REBUILD_MESSAGE, NativeOAuthUnavailableError } =
      await import("@/lib/native/open-url");

    await expect(
      openOAuthUrl("https://accounts.google.com/o/oauth2/auth?client_id=test"),
    ).rejects.toThrow(NATIVE_IOS_OAUTH_REBUILD_MESSAGE);
    await expect(
      openOAuthUrl("https://accounts.google.com/o/oauth2/auth?client_id=test"),
    ).rejects.toBeInstanceOf(NativeOAuthUnavailableError);

    expect(authenticateMock).not.toHaveBeenCalled();
    expect(browserOpenMock).not.toHaveBeenCalled();
  });

  it("does NOT navigate away for that pre-flight failure — the reload is the reported symptom", async () => {
    // Navigating to /auth/sign-in?error=oauth&message=… is what the user experiences as
    // "it just refreshes and goes back". Nothing was opened, so the caller renders it in place.
    stubIosNativeShell();
    isPluginAvailableMock.mockReturnValue(false);

    const { openOAuthUrl, isNativeOAuthInProgress } = await import("@/lib/native/open-url");
    await expect(
      openOAuthUrl("https://accounts.google.com/o/oauth2/auth?client_id=test"),
    ).rejects.toThrow();

    expect(window.location.href).toBe("");
    expect(window.location.replace).not.toHaveBeenCalled();
    expect(isNativeOAuthInProgress()).toBe(false);
  });

  it("treats NO_ANCHOR as a pre-flight failure — thrown, not navigated", async () => {
    // The plugin found no window to anchor the sheet to, so nothing was presented. Navigating
    // to /auth/sign-in?error=oauth&message=… would reload the WebView for nothing AND show the
    // plugin's developer string; the caller renders user-facing copy in place instead.
    stubIosNativeShell();
    authenticateMock.mockRejectedValue({
      code: "NO_ANCHOR",
      message: "No app window is available to present sign-in",
    });

    const {
      openOAuthUrl,
      isNativeOAuthInProgress,
      NativeOAuthUnavailableError,
      NATIVE_IOS_OAUTH_NO_WINDOW_MESSAGE,
    } = await import("@/lib/native/open-url");

    await expect(
      openOAuthUrl("https://accounts.google.com/o/oauth2/auth?client_id=test"),
    ).rejects.toBeInstanceOf(NativeOAuthUnavailableError);

    expect(NATIVE_IOS_OAUTH_NO_WINDOW_MESSAGE).not.toContain("No app window is available");
    await expect(
      openOAuthUrl("https://accounts.google.com/o/oauth2/auth?client_id=test"),
    ).rejects.toThrow(NATIVE_IOS_OAUTH_NO_WINDOW_MESSAGE);

    expect(window.location.href).toBe("");
    expect(window.location.replace).not.toHaveBeenCalled();
    expect(isNativeOAuthInProgress()).toBe(false);
  });

  it("treats START_FAILED as a pre-flight failure — thrown, not navigated", async () => {
    // `session.start()` returned false (or the arguments were rejected): the sheet was never
    // presented and the caller's promise is still live, so this must take the same throw path as
    // NO_ANCHOR rather than reloading the WebView with the plugin's developer string.
    stubIosNativeShell();
    authenticateMock.mockRejectedValue({
      code: "START_FAILED",
      message: "Failed to start authentication session",
    });

    const {
      openOAuthUrl,
      isNativeOAuthInProgress,
      NativeOAuthUnavailableError,
      NATIVE_IOS_OAUTH_START_FAILED_MESSAGE,
    } = await import("@/lib/native/open-url");

    await expect(
      openOAuthUrl("https://accounts.google.com/o/oauth2/auth?client_id=test"),
    ).rejects.toBeInstanceOf(NativeOAuthUnavailableError);

    expect(NATIVE_IOS_OAUTH_START_FAILED_MESSAGE).not.toContain("Failed to start");
    await expect(
      openOAuthUrl("https://accounts.google.com/o/oauth2/auth?client_id=test"),
    ).rejects.toThrow(NATIVE_IOS_OAUTH_START_FAILED_MESSAGE);

    expect(window.location.href).toBe("");
    expect(window.location.replace).not.toHaveBeenCalled();
    expect(isNativeOAuthInProgress()).toBe(false);
  });

  it("still navigates for a POST-flight failure — the sheet was already presented", async () => {
    // The session opened and came back with an error, so the caller's promise may be gone;
    // that failure still travels by navigation. Only pre-flight codes take the throw path.
    stubIosNativeShell();
    authenticateMock.mockRejectedValue(new Error("The operation couldn't be completed."));

    const { openOAuthUrl } = await import("@/lib/native/open-url");
    await openOAuthUrl("https://accounts.google.com/o/oauth2/auth?client_id=test");

    expect(window.location.href).toContain("/auth/sign-in?error=oauth");
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
