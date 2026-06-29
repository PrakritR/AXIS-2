import { shouldNativeRedirectToWelcome } from "@/lib/auth/native-entry-paths";
import { nativeAuthEntryPathClient } from "@/lib/auth/native-auth-entry";

/** Native app has no marketing site — send users to onboarding or their portal. */
export async function redirectNativeFromMarketing(
  getSession: () => Promise<{ session: unknown | null }>,
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!shouldNativeRedirectToWelcome(window.location.pathname)) return false;

  const entry = nativeAuthEntryPathClient();
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
