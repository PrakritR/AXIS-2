import type { SupabaseClient, User } from "@supabase/supabase-js";

/** After native OAuth, cookies may land a tick after navigation — poll before giving up. */
export async function waitForOAuthUser(
  supabase: SupabaseClient,
  options?: { attempts?: number; delayMs?: number },
): Promise<User | null> {
  const attempts = options?.attempts ?? 12;
  const delayMs = options?.delayMs ?? 250;

  for (let i = 0; i < attempts; i++) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) return user;
    } catch {
      /* retry */
    }
    if (i < attempts - 1) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, delayMs + i * 50));
    }
  }
  return null;
}
