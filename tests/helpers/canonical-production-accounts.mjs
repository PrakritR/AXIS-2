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
 * The demo Supabase project (docs/database-environments.md "Demo Supabase
 * project") is a third project, separate from dev/test and production, with
 * no fixed ref baked into source — each deployment sets its own. Wipe-only
 * tooling must be told exactly which ref is safe via this explicit env var;
 * it must never infer "safe" from merely "not production".
 */
export function allowedDemoSupabaseRef() {
  return process.env.DEMO_SUPABASE_PROJECT_REF?.trim() || "";
}

/**
 * Allowlist gate: proceed ONLY when the URL's project ref exactly matches the
 * explicitly configured demo project ref. Fails closed (refuses) when the ref
 * is unset, unlike a denylist that would let any non-production URL through —
 * including an unrecognized project a bad env value happened to resolve to.
 */
export function assertAllowlistedDemoProjectUrl(url) {
  const allowedRef = allowedDemoSupabaseRef();
  const ref = supabaseProjectRef(url);
  if (!allowedRef || ref !== allowedRef) {
    throw new Error(
      `Refusing to target ${url} (ref "${ref}"): not the allowlisted demo Supabase project. ` +
        `Set DEMO_SUPABASE_PROJECT_REF to the demo project's ref to confirm the target ` +
        `(docs/database-environments.md).`,
    );
  }
}

/** Fail-closed gate for scripts/seed-demo-supabase.mjs. */
export function assertDemoSeedGate() {
  if (process.env.ALLOW_DEMO_SEED?.trim() !== "1") {
    throw new Error("Demo seed blocked: set ALLOW_DEMO_SEED=1 to confirm you intend to write to the demo project.");
  }
}
