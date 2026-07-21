/**
 * Canonical test-DB account registry shared by the two seeds
 * (tests/helpers/seed-test-db.mjs and scripts/seed-demo-manager-workflow.mjs).
 *
 * The test Supabase project must contain ONLY the accounts both seeds create:
 * anything else (OAuth-test artifacts, one-off signups, the production admin)
 * is pruned by seed-test-db.mjs on every run. Keep this list in sync with the
 * demo workflow seed's applicant list — seed-demo-manager-workflow.mjs fails
 * loudly if an applicant email is missing here, because the prune would
 * otherwise delete that resident's account on the next E2E seed run.
 */

/** Dedicated dev/test Supabase project (docs/database-environments.md). */
export const TEST_SUPABASE_PROJECT_REF = "emstjswhotsnyksqhqyf";

/**
 * The production ops admin (src/lib/auth/primary-admin.ts). This account lives
 * ONLY in the production project — it must never be provisioned into, or kept
 * canonical in, the test DB.
 */
export const PRODUCTION_ADMIN_EMAIL = "founders@axis-seattle-housing.com";

/** Workflow seed removed — no bulk fictional residents in the test DB. */
export const DEMO_WORKFLOW_RESIDENT_EMAILS = [];

/**
 * Abort unless the Supabase URL points at the dedicated test project. Both
 * seeds create test accounts and seed-test-db.mjs DELETES non-canonical ones,
 * so running either against any other project (especially production) must be
 * impossible by accident. Override via SEED_SUPABASE_PROJECT_REF only if the
 * test project is ever migrated.
 */
export function assertTestProjectUrl(url) {
  const allowedRef = process.env.SEED_SUPABASE_PROJECT_REF?.trim() || TEST_SUPABASE_PROJECT_REF;
  let ref = "";
  try {
    ref = new URL(url).hostname.split(".")[0] ?? "";
  } catch {
    ref = "";
  }
  if (ref !== allowedRef) {
    throw new Error(
      `Refusing to seed ${url}: not the dedicated test Supabase project (${allowedRef}). ` +
        `Test seeds must never run against production (docs/database-environments.md).`,
    );
  }
}
