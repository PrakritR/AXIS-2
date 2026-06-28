import type { NextRequest, NextResponse } from "next/server";

/** Short-lived cookie holding the post-OAuth path (avoids ?next= on redirect URLs). */
export const OAUTH_NEXT_COOKIE = "axis_oauth_next";
const MAX_AGE_SEC = 600;

export function persistOAuthNextPath(path: string): void {
  if (typeof document === "undefined") return;
  if (!path.startsWith("/")) return;
  document.cookie = `${OAUTH_NEXT_COOKIE}=${encodeURIComponent(path)}; path=/; max-age=${MAX_AGE_SEC}; SameSite=Lax`;
}

export function readOAuthNextPathFromRequest(request: NextRequest): string | null {
  const raw = request.cookies.get(OAUTH_NEXT_COOKIE)?.value;
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    return decoded.startsWith("/") ? decoded : null;
  } catch {
    return null;
  }
}

export function clearOAuthNextCookie(response: NextResponse): void {
  response.cookies.set(OAUTH_NEXT_COOKIE, "", { path: "/", maxAge: 0 });
}
