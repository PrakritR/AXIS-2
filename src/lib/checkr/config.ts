/**
 * Server-side Checkr Tenant API configuration. Reads the background-check API
 * key and endpoints from the environment. The key is a Checkr secret key
 * (Bearer token) and must NEVER reach the client or the logs.
 *
 * The Tenant API (https://tenant.checkr.com/api) uses one host for both test
 * and live keys — mode is inferred from the key prefix (`ckr_sk_test_…` vs
 * `ckr_sk_live_…`), not a separate staging host.
 */

/** Resolve the Checkr secret key. Accepts either env name the captain seeded. */
export function checkrApiKey(): string | null {
  const key = (process.env.CHECKR_API_KEY ?? process.env.BACKGROUND_CHECK_API_KEY)?.trim();
  return key || null;
}

/**
 * When true, the client short-circuits network calls and returns deterministic
 * results derived from the applicant's SSN. Enabled explicitly via
 * `CHECKR_SIMULATE=1`, so a demo can be exercised on localhost even without a
 * live key.
 */
export function checkrSimulate(): boolean {
  const raw = process.env.CHECKR_SIMULATE?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/** Whether a manager can run a Checkr background check at all. */
export function backgroundCheckConfigured(): boolean {
  return Boolean(checkrApiKey()) || checkrSimulate();
}

/** Pure simulate mode (no API key) — skip Stripe; live/test API keys charge the manager card. */
export function checkrSkipsManagerCardCharge(): boolean {
  return checkrSimulate() && !checkrApiKey();
}

/** Checkr Tenant API base URL — one host for test and live keys. */
export function checkrApiBaseUrl(): string {
  const override = process.env.CHECKR_API_BASE_URL?.trim();
  return (override || "https://tenant.checkr.com/api").replace(/\/$/, "");
}

const CHECKR_PACKAGES = ["starter", "essential", "complete"] as const;
export type CheckrPackage = (typeof CHECKR_PACKAGES)[number];

/** Screening package for the order. Tenant API packages are a fixed 3-tier enum (no account-specific slugs). */
export function checkrPackage(): CheckrPackage {
  const pinned = process.env.CHECKR_PACKAGE?.trim().toLowerCase();
  return (CHECKR_PACKAGES as readonly string[]).includes(pinned ?? "")
    ? (pinned as CheckrPackage)
    : "essential";
}

export function checkrWebhookSecret(): string | null {
  return process.env.CHECKR_WEBHOOK_SECRET?.trim() || null;
}

/** All configured signing secrets (live + optional test endpoint). */
export function checkrWebhookSecrets(): string[] {
  const keys = ["CHECKR_WEBHOOK_SECRET", "CHECKR_WEBHOOK_SECRET_TEST"] as const;
  return keys.map((k) => process.env[k]?.trim()).filter((v): v is string => Boolean(v));
}

/** Flat fee (USD cents) charged to the manager's saved payment method per screening run. */
export function checkrScreeningCostCents(): number {
  const raw = Number(process.env.CHECKR_SCREENING_COST_CENTS ?? "2999");
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 2999;
}
