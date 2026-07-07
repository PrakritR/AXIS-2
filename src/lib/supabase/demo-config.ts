/**
 * Optional dedicated Supabase project for the public `/demo` sandbox.
 * When unset, `/demo` falls back to client-side localStorage seed data.
 *
 * The demo project must never be the production project — see assertDemoSupabaseIsolated.
 */

export type DemoSupabasePublicConfig = {
  url: string;
  anonKey: string;
};

export function getDemoSupabasePublicConfig(): DemoSupabasePublicConfig | null {
  const url = process.env.NEXT_PUBLIC_DEMO_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_DEMO_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isDemoSupabaseConfigured(): boolean {
  return getDemoSupabasePublicConfig() !== null;
}

/** True when `/demo` should seed browser-local stores (no demo Supabase project). */
export function usesDemoLocalStorageSeed(): boolean {
  return !isDemoSupabaseConfigured();
}
