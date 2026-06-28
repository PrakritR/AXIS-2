import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { User } from "@supabase/supabase-js";

/** Poll briefly after OAuth redirect while the browser session cookie is applied. */
export async function waitForAuthUser(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  attempts = 8,
): Promise<User | null> {
  for (let i = 0; i < attempts; i++) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) return user;
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }
  return null;
}
