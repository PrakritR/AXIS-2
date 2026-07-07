import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getDemoSupabasePublicConfig } from "@/lib/supabase/demo-config";

function demoServiceRoleKey(): string | null {
  return process.env.DEMO_SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
}

function demoServiceUrl(): string | null {
  return (
    process.env.DEMO_SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_DEMO_SUPABASE_URL?.trim() ||
    null
  );
}

/**
 * Fail closed when the demo project URL matches the live production project.
 * Demo must stay isolated from real manager/resident/vendor accounts.
 */
export function assertDemoSupabaseIsolated(): void {
  const demoUrl = demoServiceUrl();
  if (!demoUrl) return;

  const prodRef = process.env.AXIS_PROD_SUPABASE_REF?.trim();
  const prodUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!prodRef && !prodUrl) return;

  let demoRef = "";
  try {
    demoRef = new URL(demoUrl).hostname.split(".")[0] ?? "";
  } catch {
    return;
  }

  if (prodRef && demoRef === prodRef) {
    throw new Error(
      `Refusing demo Supabase client: NEXT_PUBLIC_DEMO_SUPABASE_URL points at the production project (${prodRef}). ` +
        `Use a separate demo Supabase project. See docs/database-environments.md.`,
    );
  }

  if (prodUrl) {
    try {
      const prodRefFromUrl = new URL(prodUrl).hostname.split(".")[0] ?? "";
      if (prodRefFromUrl && demoRef === prodRefFromUrl) {
        throw new Error(
          "Refusing demo Supabase client: demo URL matches NEXT_PUBLIC_SUPABASE_URL. " +
            "Use a separate demo Supabase project.",
        );
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Refusing demo Supabase")) throw e;
    }
  }
}

/** Service role client for the optional demo Supabase project (server-only). */
export function createDemoSupabaseServiceRoleClient() {
  assertDemoSupabaseIsolated();
  const url = demoServiceUrl();
  const key = demoServiceRoleKey();
  if (!url || !key) {
    throw new Error("Missing DEMO_SUPABASE_URL or DEMO_SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!getDemoSupabasePublicConfig()) {
    throw new Error("Missing NEXT_PUBLIC_DEMO_SUPABASE_URL or NEXT_PUBLIC_DEMO_SUPABASE_ANON_KEY");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
