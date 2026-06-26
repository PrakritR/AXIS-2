import { resolveShareableAppOrigin } from "@/lib/app-url";

/** Supabase password-reset links land on /auth/callback, then redirect here. */
export const PASSWORD_RESET_NEXT_PATH = "/auth/reset-password";

export function passwordResetCallbackUrl(origin: string): string {
  const base = origin.trim().replace(/\/$/, "");
  const next = encodeURIComponent(PASSWORD_RESET_NEXT_PATH);
  return `${base}/auth/callback?next=${next}`;
}

/** Shareable links (QR, invites) — may prefer canonical domain over localhost. */
export function resolveBrowserAppOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return resolveShareableAppOrigin(window.location.origin);
  }
  return resolveShareableAppOrigin();
}

/**
 * OAuth redirect target must stay on the current browser origin so the session
 * cookie and post-login route match (never bounce localhost → production).
 */
export function resolveOAuthBrowserOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
  return resolveShareableAppOrigin();
}
