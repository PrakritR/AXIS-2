/**
 * Production-only demo account registry and fail-closed guards for
 * scripts/seed-production-portal.mjs. These accounts use @axis.local so outbound
 * email/cron paths skip them (see portal-inbox-delivery, payment reminders).
 *
 * NEVER run production seeds against the dev/test project; NEVER run test seeds
 * against production. See docs/database-environments.md.
 */

/** Production Supabase project ref (public identifier, not a secret). */
export const PRODUCTION_SUPABASE_PROJECT_REF = "qahnczmilgptcedaqype";

/** Primary production demo portal accounts (mirror src/lib/demo/demo-session.ts). */
export const PROD_DEMO_MANAGER_EMAIL = "alex.morgan@axis.local";
export const PROD_DEMO_RESIDENT_EMAIL = "jordan.lee@axis.local";
export const PROD_DEMO_VENDOR_EMAIL = "cascade.mechanical@axis.local";

export const PROD_DEMO_MANAGER_NAME = "Alex Morgan";
export const PROD_DEMO_RESIDENT_NAME = "Jordan Lee";
export const PROD_DEMO_VENDOR_NAME = "Cascade Mechanical";

/**
 * Previously used by production workflow seed — no longer populated.
 * @axis.local accounts are not seeded into production Supabase.
 */
export const PROD_WORKFLOW_RESIDENT_EMAILS = [];

export function supabaseProjectRef(url) {
  try {
    return new URL(url).hostname.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

export function productionSupabaseProjectRef() {
  return process.env.AXIS_PROD_SUPABASE_REF?.trim() || PRODUCTION_SUPABASE_PROJECT_REF;
}

export function isProductionSupabaseProjectUrl(url) {
  return supabaseProjectRef(url) === productionSupabaseProjectRef();
}

/**
 * Abort unless the Supabase URL points at the production project. Inverse of
 * assertTestProjectUrl in canonical-test-accounts.mjs.
 */
export function assertProductionProjectUrl(url) {
  const requiredRef = productionSupabaseProjectRef();
  const ref = supabaseProjectRef(url);
  if (ref !== requiredRef) {
    throw new Error(
      `Refusing production seed on ${url}: expected the production Supabase project (${requiredRef}). ` +
        `Dev/test seeds must use the test project instead (docs/database-environments.md).`,
    );
  }
}

/**
 * Fail-closed gate: production seed scripts refuse to run unless the operator
 * sets ALLOW_PRODUCTION_SEED=1 and loads AXIS_PRODUCTION_SEED_KEY (server-only
 * secret from Vercel Production scope).
 */
export function assertProductionSeedGate() {
  if (process.env.ALLOW_PRODUCTION_SEED?.trim() !== "1") {
    throw new Error(
      "Production seed blocked: set ALLOW_PRODUCTION_SEED=1 to confirm you intend to write to production.",
    );
  }
  if (!process.env.AXIS_PRODUCTION_SEED_KEY?.trim()) {
    throw new Error(
      "Production seed blocked: set AXIS_PRODUCTION_SEED_KEY (server-only secret in Vercel Production scope).",
    );
  }
}

/**
 * Abort when the demo seed target is the production project. Demo must use a
 * separate Supabase project (NEXT_PUBLIC_DEMO_SUPABASE_URL / DEMO_SUPABASE_URL).
 */
export function assertDemoProjectNotProduction(url) {
  const requiredRef = productionSupabaseProjectRef();
  const ref = supabaseProjectRef(url);
  if (ref === requiredRef) {
    throw new Error(
      `Refusing demo seed on production project (${requiredRef}). ` +
        `Point DEMO_SUPABASE_URL at a separate demo Supabase project.`,
    );
  }
}

/** Fail-closed gate for scripts/seed-demo-supabase.mjs. */
export function assertDemoSeedGate() {
  if (process.env.ALLOW_DEMO_SEED?.trim() !== "1") {
    throw new Error("Demo seed blocked: set ALLOW_DEMO_SEED=1 to confirm you intend to write to the demo project.");
  }
}
