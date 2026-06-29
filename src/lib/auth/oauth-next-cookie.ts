import type { NextRequest, NextResponse } from "next/server";

import { normalizePostAuthPath } from "@/lib/auth/normalize-post-auth-path";

/** Short-lived cookie holding the post-OAuth path (avoids ?next= on redirect URLs). */
export const OAUTH_NEXT_COOKIE = "axis_oauth_next";
export const OAUTH_NEXT_STORAGE_KEY = "axis_oauth_next";
const MAX_AGE_SEC = 600;

export function persistOAuthNextPath(path: string): void {
  if (typeof document === "undefined") return;
  const normalized = normalizePostAuthPath(path);
  if (!normalized.startsWith("/") || normalized === "/auth/continue") return;
  document.cookie = `${OAUTH_NEXT_COOKIE}=${encodeURIComponent(normalized)}; path=/; max-age=${MAX_AGE_SEC}; SameSite=Lax`;
  try {
    sessionStorage.setItem(OAUTH_NEXT_STORAGE_KEY, normalized);
  } catch {
    /* private mode / WebView restrictions */
  }
}

export function readOAuthNextPathFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(OAUTH_NEXT_STORAGE_KEY);
    return raw?.startsWith("/") ? raw : null;
  } catch {
    return null;
  }
}

export function clearOAuthNextPathStorage(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(OAUTH_NEXT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
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
