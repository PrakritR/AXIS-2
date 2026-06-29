import { shouldNativeRedirectToWelcome } from "@/lib/auth/native-entry-paths";
import { nativeAuthEntryPathClient } from "@/lib/auth/native-auth-entry";

/** Generic /auth/sign-in is the web portal — native uses the welcome role picker. */
export function shouldNativeRedirectFromSignIn(pathname: string, search: string): boolean {
  if (pathname !== "/auth/sign-in") return false;
  const params = new URLSearchParams(search);
  if (params.get("intent") === "resident" || params.get("intent") === "manager") return false;
  if (params.get("next")?.trim()) return false;
  return true;
}

/** Native app has no marketing site — send users to onboarding or their portal. */
export async function redirectNativeFromMarketing(
  getSession: () => Promise<{ session: unknown | null }>,
): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const entry = nativeAuthEntryPathClient();

  if (shouldNativeRedirectFromSignIn(window.location.pathname, window.location.search)) {
    if (entry !== window.location.pathname) {
      window.location.replace(entry);
      return true;
    }
    return false;
  }

  if (!shouldNativeRedirectToWelcome(window.location.pathname)) return false;
  try {
    const { session } = await getSession();
    window.location.replace(session ? "/auth/continue" : entry);
    return true;
  } catch {
    window.location.replace(entry);
    return true;
  }
}

/** @deprecated Use redirectNativeFromMarketing */
export async function maybeRedirectNativeToWelcome(
  getSession: () => Promise<{ session: unknown | null }>,
): Promise<boolean> {
  return redirectNativeFromMarketing(getSession);
}
