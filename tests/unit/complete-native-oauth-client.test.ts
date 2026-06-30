// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from "vitest";
import { appendOAuthContextToCallbackPath } from "@/lib/auth/complete-native-oauth-client";

describe("appendOAuthContextToCallbackPath", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("adds stored oauth context to the callback path", () => {
    sessionStorage.setItem("axis_oauth_next", "/portal/dashboard");
    sessionStorage.setItem("axis_oauth_intent", "manager");
    sessionStorage.setItem("axis_oauth_surface", "native");

    const path = appendOAuthContextToCallbackPath(
      "/auth/callback?code=abc",
      "https://www.axis-seattle-housing.com",
    );

    const url = new URL(path, "https://www.axis-seattle-housing.com");
    expect(url.searchParams.get("code")).toBe("abc");
    expect(url.searchParams.get("next")).toBe("/portal/dashboard");
    expect(url.searchParams.get("oauth_intent")).toBe("manager");
    expect(url.searchParams.get("oauth_surface")).toBe("native");
  });

  it("does not overwrite existing query params", () => {
    sessionStorage.setItem("axis_oauth_intent", "resident");

    const path = appendOAuthContextToCallbackPath(
      "/auth/callback?code=abc&oauth_intent=manager",
      "https://www.axis-seattle-housing.com",
    );

    expect(new URL(path, "https://www.axis-seattle-housing.com").searchParams.get("oauth_intent")).toBe(
      "manager",
    );
  });
});

describe("completeNativeOAuthInWebView", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.resetModules();
  });

  it("exchanges the code and routes to the portal", async () => {
    sessionStorage.setItem("axis_oauth_intent", "manager");
    sessionStorage.setItem("axis_oauth_surface", "native");

    vi.doMock("@/lib/supabase/browser", () => ({
      createSupabaseBrowserClient: () => ({
        auth: {
          exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
        },
      }),
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ redirectTo: "/portal/dashboard" }),
      }),
    );

    const { completeNativeOAuthInWebView } = await import("@/lib/auth/complete-native-oauth-client");
    const result = await completeNativeOAuthInWebView("/auth/callback?code=abc123");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.redirectTo).toBe("/portal/dashboard");
    }
    expect(sessionStorage.getItem("axis_oauth_intent")).toBeNull();
  });

  it("retries portal access when session cookies are not ready yet", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ redirectTo: "/portal/dashboard" }),
      });

    vi.stubGlobal("fetch", fetchMock);

    vi.doMock("@/lib/supabase/browser", () => ({
      createSupabaseBrowserClient: () => ({
        auth: {
          exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
        },
      }),
    }));

    const { completeNativeOAuthInWebView } = await import("@/lib/auth/complete-native-oauth-client");
    const result = await completeNativeOAuthInWebView("/auth/callback?code=abc123");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.redirectTo).toBe("/portal/dashboard");
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
