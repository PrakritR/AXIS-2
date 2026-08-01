/**
 * Reset links minted before `/auth/confirm` shipped still arrive at
 * `/auth/callback?next=%2Fauth%2Freset-password&code=…` for as long as they live.
 * That `code` is PKCE-bound to the browser that requested the reset, so a click from
 * Gmail on another device fails — and the old handler answered by redirecting to
 * `/auth/sign-in?error=oauth&message=PKCE+code+verifier+not+found+in+storage…`,
 * telling the user their *Google sign-in* was broken. This is the reproduction of the
 * reported bug, pinned as a regression test.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const exchangeCodeForSession = vi.fn(async () => ({
  data: { session: null },
  error: { message: "PKCE code verifier not found in storage." },
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ auth: { exchangeCodeForSession, getUser: vi.fn() } })),
}));

vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceRoleClient: vi.fn(() => ({})) }));

const RESET_PATH = "/auth/reset-password";

describe("legacy PKCE reset links landing on /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("sends a failed recovery exchange to the reset page, not the OAuth error banner", async () => {
    const { handleOAuthCallback } = await import("@/lib/auth/oauth-callback-handler");

    const request = new NextRequest(
      "https://prop-lane.space/auth/callback?next=%2Fauth%2Freset-password&code=abc123",
    );
    const response = await handleOAuthCallback(request, RESET_PATH);

    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toBe(`https://prop-lane.space${RESET_PATH}`);
    expect(location).not.toContain("/auth/sign-in");
    expect(location).not.toContain("error=oauth");
    expect(location).not.toContain("PKCE");
  });

  it("does the same when the link carries no code at all", async () => {
    const { handleOAuthCallback } = await import("@/lib/auth/oauth-callback-handler");

    const request = new NextRequest("https://prop-lane.space/auth/callback?next=%2Fauth%2Freset-password");
    const response = await handleOAuthCallback(request, RESET_PATH);

    expect(response.headers.get("location")).toBe(`https://prop-lane.space${RESET_PATH}`);
  });

  it("still routes a genuine OAuth failure to the sign-in error banner", async () => {
    const { handleOAuthCallback } = await import("@/lib/auth/oauth-callback-handler");

    const request = new NextRequest("https://prop-lane.space/auth/callback?code=abc123");
    const response = await handleOAuthCallback(request, "/auth/continue");

    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/auth/sign-in");
    expect(location).toContain("error=oauth");
  });
});

describe("a recovery session is never rerouted away from the reset form", () => {
  it("bypasses the portal gate for the reset path whatever the account's role is", async () => {
    const { resolveOAuthPortalRedirect } = await import("@/lib/auth/resolve-oauth-portal-access");

    // A role lookup would send a resident to /resident/… and a role-less account to
    // Get started — signed in, but never shown the form. The bypass runs first, so the
    // supabase client is not even consulted.
    const db = { from: vi.fn(() => { throw new Error("role lookup must not run"); }) };
    const user = { id: "user-1", email: "resident@example.com" } as never;

    await expect(
      resolveOAuthPortalRedirect(db as never, user, RESET_PATH),
    ).resolves.toBe(RESET_PATH);
  });
});
