import "server-only";

/**
 * True when running in the production deployment. Prefers Vercel's VERCEL_ENV
 * ("production" | "preview" | "development") and falls back to NODE_ENV when
 * VERCEL_ENV is unset (e.g. self-hosted or local builds).
 */
export function isProductionRuntime(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv) return vercelEnv === "production";
  return process.env.NODE_ENV === "production";
}

/**
 * Expected admin registration key. In production this must be set via the
 * server-only AXIS_ADMIN_REGISTER_KEY env var; if unset, admin registration is
 * disabled (fail closed). In dev it falls back to a well-known default for
 * convenience.
 */
export function getAdminRegisterKey(): string | null {
  const fromEnv = process.env.AXIS_ADMIN_REGISTER_KEY?.trim();
  if (fromEnv) return fromEnv;
  return isProductionRuntime() ? null : "prakrit-admin-register";
}

/**
 * Payment-waiver code that bypasses Stripe checkout. In production this must be
 * set via the server-only AXIS_PAYMENT_WAIVER_CODE env var; if unset, the
 * waiver is disabled (fail closed). In dev it falls back to a well-known
 * default for convenience.
 */
export function getPaymentWaiverCode(): string | null {
  const fromEnv = process.env.AXIS_PAYMENT_WAIVER_CODE?.trim();
  if (fromEnv) return fromEnv;
  return isProductionRuntime() ? null : "FREE100";
}
