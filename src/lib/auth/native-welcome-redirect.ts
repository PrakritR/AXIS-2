import { shouldNativeRedirectToWelcome } from "@/lib/auth/native-entry-paths";

/** Native app has no marketing site — send users to onboarding or their portal. */
export async function redirectNativeFromMarketing(
  getSession: () => Promise<{ session: unknown | null }>,
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!shouldNativeRedirectToWelcome(window.location.pathname)) return false;

  try {
    const { session } = await getSession();
    window.location.replace(session ? "/auth/continue" : "/auth/welcome");
    return true;
  } catch {
    window.location.replace("/auth/welcome");
    return true;
  }
}

/** @deprecated Use redirectNativeFromMarketing */
export async function maybeRedirectNativeToWelcome(
  getSession: () => Promise<{ session: unknown | null }>,
): Promise<boolean> {
  return redirectNativeFromMarketing(getSession);
}
