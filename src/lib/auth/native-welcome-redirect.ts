import { shouldNativeRedirectToWelcome } from "@/lib/auth/native-entry-paths";
import { MANAGER_PRICING_ENTRY_PATH } from "@/lib/auth/manager-pricing-entry-path";
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
  const { pathname, search } = window.location;

  if (pathname === "/partner/pricing" || pathname === "/pricing") {
    window.location.replace(MANAGER_PRICING_ENTRY_PATH + search);
    return true;
  }

  if (shouldNativeRedirectFromSignIn(pathname, search)) {
    if (entry !== pathname) {
      window.location.replace(entry);
      return true;
    }
    return false;
  }

  if (!shouldNativeRedirectToWelcome(pathname)) return false;
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
