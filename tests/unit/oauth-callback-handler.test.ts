import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

let capturedSetAll: ((cookies: { name: string; value: string; options?: object }[]) => void) | null = null;

const exchangeCodeForSession = vi.fn(async () => {
  capturedSetAll?.([
    { name: "sb-access-token", value: "token-value", options: { httpOnly: true, path: "/" } },
  ]);
  return { error: null };
});

const getUser = vi.fn(async () => ({ data: { user: { id: "user-1", email: "a@example.com" } } }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn((_url: string, _anon: string, options: { cookies: { setAll: typeof capturedSetAll } }) => {
    capturedSetAll = options.cookies.setAll;
    return {
      auth: {
        exchangeCodeForSession,
        getUser,
      },
    };
  }),
}));

vi.mock("@/lib/auth/reconcile-auth-accounts-by-email", () => ({
  reconcileAuthAccountsByEmail: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth/resolve-oauth-portal-access", () => ({
  resolveOAuthPortalRedirect: vi.fn(async () => "/partner/pricing"),
}));

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: vi.fn(() => ({})),
}));

describe("handleOAuthCallback", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    capturedSetAll = null;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("replays auth cookies when redirect path changes after resolve", async () => {
    const { handleOAuthCallback } = await import("@/lib/auth/oauth-callback-handler");

    const request = new NextRequest("https://axis.example.com/auth/callback?code=abc123");
    const response = await handleOAuthCallback(request, "/auth/continue");

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://axis.example.com/partner/pricing");
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("sb-access-token=token-value");
  });
});
