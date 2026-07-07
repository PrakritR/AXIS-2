import { createBrowserClient } from "@supabase/ssr";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { getDemoSupabasePublicConfig } from "@/lib/supabase/demo-config";

let demoSupabaseBrowserClient: ReturnType<typeof createBrowserClient> | null = null;

/** Browser client for the optional demo Supabase project — only on `/demo`. */
export function createDemoSupabaseBrowserClient() {
  if (!isDemoModeActive()) {
    throw new Error("Demo Supabase client is only available on /demo");
  }
  const config = getDemoSupabasePublicConfig();
  if (!config) {
    throw new Error("Missing NEXT_PUBLIC_DEMO_SUPABASE_URL or NEXT_PUBLIC_DEMO_SUPABASE_ANON_KEY");
  }
  demoSupabaseBrowserClient ??= createBrowserClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return demoSupabaseBrowserClient;
}
