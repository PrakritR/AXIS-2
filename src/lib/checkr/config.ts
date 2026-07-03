/**
 * Server-side Checkr configuration. Reads the background-check API key and
 * endpoints from the environment. The key is a Checkr *secret* key (Basic-auth
 * username) and must NEVER reach the client or the logs.
 *
 * The captain provisioned a test-mode key (`ckr_sk_test_…`). Test keys talk to
 * Checkr's staging host, which returns deterministic results for Checkr's
 * documented mocked candidate profiles. See `docs`/AXI-58 notes.
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
 * live key or without entering Checkr's exact mocked candidate data.
 */
export function checkrSimulate(): boolean {
  const raw = process.env.CHECKR_SIMULATE?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/** Whether a manager can run a Checkr background check at all. */
export function backgroundCheckConfigured(): boolean {
  return Boolean(checkrApiKey()) || checkrSimulate();
}

/**
 * Checkr API base URL. A test key (`ckr_sk_test_…`) targets the staging host by
 * default; live keys should override with `CHECKR_API_BASE_URL`.
 */
export function checkrApiBaseUrl(): string {
  const override = process.env.CHECKR_API_BASE_URL?.trim();
  if (override) return override.replace(/\/$/, "");
  const key = checkrApiKey() ?? "";
  const isLive = key.startsWith("ckr_sk_live_") || key.startsWith("ckr_live_");
  return isLive ? "https://api.checkr.com/v1" : "https://api.checkr-staging.com/v1";
}

/**
 * Report package slug. Packages are account-specific (created in the Checkr
 * dashboard), so this is configurable. When unset the client auto-resolves the
 * first package on the account via `GET /packages`. AXI-58: a sensible default
 * keeps the demo working; the manager can pin a specific package via env.
 */
export function checkrPackageSlug(): string | null {
  return process.env.CHECKR_PACKAGE?.trim() || null;
}

export function checkrWebhookSecret(): string | null {
  return process.env.CHECKR_WEBHOOK_SECRET?.trim() || null;
}
