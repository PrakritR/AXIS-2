import { resolveShareableAppOrigin } from "@/lib/app-url";

/** Supabase password-reset links land on /auth/callback, then redirect here. */
export const PASSWORD_RESET_NEXT_PATH = "/auth/reset-password";

export function passwordResetCallbackUrl(origin: string): string {
  const base = origin.trim().replace(/\/$/, "");
  const next = encodeURIComponent(PASSWORD_RESET_NEXT_PATH);
  return `${base}/auth/callback?next=${next}`;
}

export function resolveBrowserAppOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return resolveShareableAppOrigin(window.location.origin);
  }
  return resolveShareableAppOrigin();
}
