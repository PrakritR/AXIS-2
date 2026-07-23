import type { NextRequest, NextResponse } from "next/server";

/**
 * Id of the session already signed in on the create-account surface. A cookie,
 * not web storage: the browser and the OAuth callback route both read it.
 */
export const PRE_OAUTH_USER_COOKIE = "axis_pre_oauth_user";
const COOKIE_MAX_AGE_SEC = 600;

export function persistPreOAuthUser(userId: string | null): void {
  if (typeof document === "undefined") return;
  const trimmed = userId?.trim();
  if (!trimmed) {
    clearPreOAuthUser();
    return;
  }
  document.cookie = `${PRE_OAUTH_USER_COOKIE}=${encodeURIComponent(trimmed)}; path=/; max-age=${COOKIE_MAX_AGE_SEC}; SameSite=Lax`;
}

export function readPreOAuthUser(): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${PRE_OAUTH_USER_COOKIE}=`;
  const row = document.cookie.split("; ").find((entry) => entry.startsWith(prefix));
  if (!row) return null;
  try {
    return decodeURIComponent(row.slice(prefix.length)).trim() || null;
  } catch {
    return null;
  }
}

export function clearPreOAuthUser(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${PRE_OAUTH_USER_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

export function readPreOAuthUserFromRequest(request: NextRequest): string | null {
  const raw = request.cookies.get(PRE_OAUTH_USER_COOKIE)?.value;
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).trim() || null;
  } catch {
    return null;
  }
}

export function clearPreOAuthUserCookie(response: NextResponse): void {
  response.cookies.set(PRE_OAUTH_USER_COOKIE, "", { path: "/", maxAge: 0 });
}
