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
 * Workflow-seed applicants for production (@axis.local). Keep in sync with
 * scripts/seed-demo-manager-workflow.mjs buildApplicants() when that list changes.
 */
export const PROD_WORKFLOW_RESIDENT_EMAILS = [
  ["Maya", "Chen"],
  ["Liam", "Novak"],
  ["Ava", "Rossi"],
  ["Noah", "Park"],
  ["Sofia", "Diaz"],
  ["Diego", "Morales"],
  ["Grace", "Hall"],
  ["Owen", "Bennett"],
  ["Ethan", "Wright"],
  ["Olivia", "Brooks"],
  ["Isabella", "Nguyen"],
  ["Mason", "Clark"],
  ["Lucas", "Kim"],
  ["Chloe", "Adams"],
].map(([first, last]) => `${first}.${last}.seed@axis.local`.toLowerCase());

/**
 * Abort unless the Supabase URL points at the production project. Inverse of
 * assertTestProjectUrl in canonical-test-accounts.mjs.
 */
export function assertProductionProjectUrl(url) {
  const requiredRef = process.env.AXIS_PROD_SUPABASE_REF?.trim() || PRODUCTION_SUPABASE_PROJECT_REF;
  let ref = "";
  try {
    ref = new URL(url).hostname.split(".")[0] ?? "";
  } catch {
    ref = "";
  }
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
