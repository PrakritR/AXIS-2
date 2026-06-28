import { describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import {
  OAUTH_NEXT_COOKIE,
  clearOAuthNextCookie,
  persistOAuthNextPath,
  readOAuthNextPathFromRequest,
} from "@/lib/auth/oauth-next-cookie";

describe("oauth-next-cookie", () => {
  it("persists and reads a safe relative path", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("document", {
      get cookie() {
        return "";
      },
      set cookie(value: string) {
        const eq = value.indexOf("=");
        const name = value.slice(0, eq);
        storage.set(name, value);
      },
    });

    persistOAuthNextPath("/partner/pricing?google_checkout=1");

    const stored = storage.get(OAUTH_NEXT_COOKIE);
    expect(stored).toContain(encodeURIComponent("/partner/pricing?google_checkout=1"));

    const request = new NextRequest("http://localhost:3000/auth/callback", {
      headers: {
        cookie: `${OAUTH_NEXT_COOKIE}=${encodeURIComponent("/partner/pricing?google_checkout=1")}`,
      },
    });
    expect(readOAuthNextPathFromRequest(request)).toBe("/partner/pricing?google_checkout=1");

    vi.unstubAllGlobals();
  });

  it("clears the oauth next cookie on the response", () => {
    const response = NextResponse.redirect("http://localhost:3000/auth/continue");
    clearOAuthNextCookie(response);
    expect(response.cookies.get(OAUTH_NEXT_COOKIE)?.value).toBe("");
  });
});
